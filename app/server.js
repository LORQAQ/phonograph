'use strict'
/*
 * LX Music 类桌面音乐播放器 —— 本地服务端
 * ---------------------------------------------------------------
 * 职责：
 *   1. 托管静态前端（public/）
 *   2. 音乐元数据：网易云官方接口（搜索/详情/歌词/封面）
 *   3. 播放地址：加载 LX 兼容自定义音源脚本（sources/*.js）多源回退取流
 *   4. 音频代理：带 Referer 转发 CDN 流，支持 Range（拖动进度）
 *   5. 本地数据：歌单 / 设置 持久化到 data/db.json
 */
const http = require('node:http')
const https = require('node:https')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const crypto = require('node:crypto')
const net = require('node:net')
const { URL } = require('node:url')

const netease = require('./lib/netease.js')
const qq = require('./lib/qq.js')
const kugou = require('./lib/kugou.js')
const { importPlaylist } = require('./lib/playlist-import.js')
const { SourceManager } = require('./lib/source-manager.js')
const resolveWithCross = require('./lib/cross-platform.js')
const transcoder = require('./lib/transcode.js')

const ROOT = path.resolve(__dirname, '..')
const PUBLIC = path.join(ROOT, 'public')
const DATA = path.join(ROOT, 'data')
const DB_FILE = path.join(DATA, 'db.json')
const PORT = Number(process.env.PORT || 37621)
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

process.on('unhandledRejection', (e) => console.warn('[warn] 未处理的 Promise 拒绝:', e && e.message))

/* ---------------- 数据库（JSON） ---------------- */
function loadDb () {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))
  } catch (e) {
    /* B6: 解析失败时备份损坏文件，避免用户数据无声消失 */
    try {
      if (fs.existsSync(DB_FILE)) {
        /* B45: 时间戳备份，最多留 5 份；固定名 .bak 会被下一次启动覆盖掉 */
        const bak = DB_FILE + '.corrupt-' + new Date().toISOString().replace(/[:.]/g, '-')
        fs.copyFileSync(DB_FILE, bak)
        try {
          const all = fs.readdirSync(DATA).filter((f) => f.startsWith('db.json.corrupt-')).sort()
          while (all.length > 5) { try { fs.unlinkSync(path.join(DATA, all.shift())) } catch (e) { } }
        } catch (e) { }
        global.__DB_RECOVERED_FROM = bak
        console.error('[db] 数据文件损坏，已备份到 ' + bak + '：' + e.message)
      }
    } catch (e2) { }
    return {}
  }
}
const db = Object.assign({
  playlists: [{ id: 'default', name: '默认列表', songs: [] }],
  settings: {
    quality: '320k',
    platform: 'wy',
    volume: 0.8,
    sourceOrder: [],
    disabledSources: [],
  },
  history: [],
}, loadDb())
if (!Array.isArray(db.playlists) || !db.playlists.length) db.playlists = [{ id: 'default', name: '默认列表', songs: [] }]
db.settings = Object.assign({ quality: '320k', platform: 'wy', volume: 0.8, sourceOrder: [], disabledSources: [] }, db.settings || {})

let saveTimer = null
/* B41: 合并写入 + 上限延迟（连续拖音量不会永远不落盘）+ 失败向上抛 */
let dbDirty = false
let dbFirstDirtyAt = 0
/* P0: 指数退避的重试计数。之前只有赋值没有声明，
   'use strict' 下每次保存都会抛 ReferenceError，
   被当成写盘失败 → 重试逻辑永远不生效，磁盘上一直是旧值。 */
let dbRetry = 0

function saveDb () {
  dbDirty = true
  if (!dbFirstDirtyAt) dbFirstDirtyAt = Date.now()
  clearTimeout(saveTimer)
  /* 第一次脏之后最多等 2 秒，之后立刻写 */
  const wait = Date.now() - dbFirstDirtyAt > 2000 ? 0 : 300
  saveTimer = setTimeout(flushDb, wait)
}

function flushDb () {
  /* guard: 这个函数唯一的常规调用点是 setTimeout 回调，
     任何异常逃出去都会变成 uncaughtException。
     内层已经自己处理了写盘失败，这里只是最后一道保险。 */
  try {
    flushDbInner()
  } catch (e) {
    try { console.error('[db] flushDb 异常（已兜住）:', e && e.message) } catch (e2) { }
    dbDirty = true
    if (!saveTimer) {
      try { saveTimer = setTimeout(flushDb, 5000) } catch (e3) { }
    }
  }
}
function flushDbInner () {
  if (!dbDirty) return
  clearTimeout(saveTimer)
  saveTimer = null
  try {
    writeDbNow()
    dbDirty = false
    dbFirstDirtyAt = 0
    dbRetry = 0
  } catch (e) {
    /* P0-2: 绝不能往外抛 —— flushDb 唯一的常规调用点是 setTimeout 回调，
       抛出去就是 uncaughtException，整个播放器会被一次写盘失败干掉。
       这里改成 3 秒后重试，自愈。 */
    dbDirty = true
    console.error('[db] 写盘失败，3 秒后重试:', e.message)
    /* P3-6: 指数退避，别每 3 秒刷日志 */
    dbRetry = Math.min((dbRetry || 0) + 1, 6)
    const __delay = Math.min(60000, 1000 * Math.pow(2, dbRetry))
    if (dbRetry <= 2) console.error('[db] 写盘失败，' + Math.round(__delay / 1000) + 's 后重试:', e.message)
    if (!saveTimer) saveTimer = setTimeout(flushDb, __delay)
  }
}

/* B6: 原子写 —— 先写 .tmp 再 rename，断电不会写坏原文件 */
function writeDbNow () {
  fs.mkdirSync(DATA, { recursive: true })
  const tmp = DB_FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8')
  fs.renameSync(tmp, DB_FILE)
}

/* ---------------- 音源管理 ---------------- */
const urlCache = new Map()
/* B47: LRU 读取/写入（命中时提升到最新） */
function cacheGet (map, key) {
  const hit = map.get(key)
  if (!hit) return null
  if (hit.exp <= Date.now()) { map.delete(key); return null }
  map.delete(key); map.set(key, hit)
  return hit.value
}
function cacheSet (map, key, value, ttl, max) {
  map.delete(key)
  map.set(key, { value, exp: Date.now() + ttl })
  if (map.size > max) map.delete(map.keys().next().value)
}
/* B18: 同一首歌并发请求时只跑一次解析 */
const urlInflight = new Map()
const sourceManager = new SourceManager(path.join(ROOT, 'sources'), db.settings)
/* QQ 歌单需要登录：把之前保存的 Cookie 注入 */
try { if (db.settings.qqCookie) qq.setCookie(db.settings.qqCookie) } catch (e) { }
const loadPromise = sourceManager.loadAll().then(() => {
  const ok = sourceManager.list().filter((s) => s.status === 'ok')
  console.log('[音源] 已加载 ' + sourceManager.list().length + ' 个脚本，可用 ' + ok.length + ' 个：' + ok.map((s) => s.name).join('、'))
}).catch((e) => { console.error('[音源] 加载失败:', e && e.message) })

/* ---------------- 工具 ---------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.map': 'application/json',
}
function json (res, code, data) {
  const body = Buffer.from(JSON.stringify(data), 'utf8')
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length, 'Cache-Control': 'no-store' })
  res.end(body)
}

/* ---------------- 安全工具（BUG-REPORT-2） ---------------- */

/* B7: 本地会话 token。外壳启动时通过 env 注入，前端通过 /api/health 拿到 */
const SESSION_TOKEN = process.env.PHONOGRAPH_TOKEN || crypto.randomBytes(24).toString('hex')

/* B7: 同源校验 —— 只接受本机 origin，防止恶意网页跨站 POST */
function sameOrigin (req) {
  /* Host 头由请求方决定，不能当信任锚 —— 否则 DNS rebinding 直接绕过：
     evil.example 解析到 127.0.0.1 后，浏览器同时发 Host 和 Origin 都是 evil.example，
     两者相等就被放行。这里先验 Host 必须是本机地址。 */
  const hostRaw = String(req.headers.host || '')
  const hostName = hostRaw.replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase()
  const isLocalHost = hostName === 'localhost' || hostName === '127.0.0.1' || hostName === '::1' ||
    (Array.isArray(global.__LAN_IPS) && global.__LAN_IPS.indexOf(hostName) !== -1)
  if (hostName && !isLocalHost) return false

  const o = req.headers.origin
  if (!o) return true                    /* 无 Origin 的本地请求（curl / 外壳）放行 */
  if (o === 'null') return false         /* 沙箱 iframe 可伪造 */
  let u = null
  try { u = new URL(o) } catch (err) { return false }
  const oName = String(u.hostname || '').replace(/^\[|\]$/g, '').toLowerCase()
  if (oName === hostName) return true
  if (oName === '127.0.0.1' || oName === 'localhost' || oName === '::1') return true
  if (Array.isArray(global.__LAN_IPS) && global.__LAN_IPS.indexOf(oName) !== -1) return true
  return false
}

/* B7: 写接口守卫。needWrite=true 时强制 POST/PUT */
function guard (req, res, needWrite) {
  if (!sameOrigin(req)) {
    json(res, 403, { error: '来源不允许' })
    return false
  }
  const tok = req.headers['x-phonograph-token']
  if (tok !== undefined && tok !== SESSION_TOKEN) {
    json(res, 403, { error: '令牌无效' })
    return false
  }
  if (needWrite && req.method !== 'POST' && req.method !== 'PUT') {
    json(res, 405, { error: '仅支持 POST' })
    return false
  }
  return true
}

/* B6: 私有地址判定 */
function isPrivateHost (h) {
  if (!h) return true
  /* B6: URL.hostname 对 IPv6 会带方括号（'[::1]'），net.isIPv6 判不出来；
     还要处理 127.1（简写）、0x7f.0.0.1（十六进制）、::ffff:127.0.0.1（IPv4-mapped） */
  let host = String(h).toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  /* IPv4-mapped：点分形式 ::ffff:a.b.c.d 和十六进制形式 ::ffff:7f00:1 都要认 */
  if (/^::ffff:(\d+\.\d+\.\d+\.\d+)$/.test(host)) {
    host = host.replace(/^::ffff:/, '')
  } else {
    const mv = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
    if (mv) {
      const hi = parseInt(mv[1], 16)
      const lo = parseInt(mv[2], 16)
      host = [(hi >> 8) & 255, hi & 255, (lo >> 8) & 255, lo & 255].join('.')
    }
  }

  /* P3-2: 浏览器的 URL 会把 127.1 / 0x7f.0.0.1 / 2130706433 / 0177.0.0.1
     都当合法 IP，但 net.isIPv4 只认标准四段十进制。这里先把各种写法归一。
     inet_aton 规则：a.b.c.d 里每段可以是十进制/八进制(0开头)/十六进制(0x开头)，
     段数可以是 1~4，缺的段按 256 进位补齐。 */
  const __aton = (str) => {
    const parts = String(str).split('.')
    if (parts.length > 4) return null
    const nums = []
    for (const raw of parts) {
      if (!raw) return null
      let v
      if (/^0x[0-9a-f]+$/i.test(raw)) v = parseInt(raw, 16)
      else if (/^0[0-7]+$/.test(raw)) v = parseInt(raw, 8)
      else if (/^[0-9]+$/.test(raw)) v = parseInt(raw, 10)
      else return null
      if (!Number.isFinite(v) || v < 0) return null
      nums.push(v)
    }
    /* 最后一段的有效位数取决于段数 */
    const n = nums.length
    if (nums.slice(0, n - 1).some((x) => x > 255)) return null
    if (nums[n - 1] >= Math.pow(256, 5 - n)) return null
    let ip = 0
    for (let i2 = 0; i2 < n; i2++) {
      if (i2 === n - 1) ip += nums[i2]
      else ip += nums[i2] * Math.pow(256, 3 - i2)
    }
    return [(ip >>> 24) & 255, (ip >>> 16) & 255, (ip >>> 8) & 255, ip & 255].join('.')
  }
  if (!/^[0-9a-fx.]+$/i.test(host) || !host.includes('.')) {
    /* 纯数字或纯 hex 也走 aton */
    if (/^[0-9]+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) {
      const n1 = __aton(host)
      if (n1) host = n1
    }
  } else if (!net.isIPv4(host)) {
    const n2 = __aton(host)
    if (n2) host = n2
  }
  if (typeof net.isIPv4 === 'function' && net.isIPv4(host)) {
    const [a, b] = host.split('.').map(Number)
    return a === 10 || a === 127 || a === 0 ||
           (a === 169 && b === 254) ||
           (a === 172 && b >= 16 && b <= 31) ||
           (a === 192 && b === 168) ||
           (a === 100 && b >= 64 && b <= 127)
  }
  if (typeof net.isIPv6 === 'function' && net.isIPv6(host)) {
    return host === '::1' || /^f[cd]/i.test(host) || /^fe80/i.test(host)
  }
  return /^(localhost|.*\.local|.*\.internal)$/i.test(host)
}

/* B6: 封面只允许这些 CDN */
const PIC_HOST_ALLOW = [
  /(^|\.)music\.126\.net$/i,
  /(^|\.)126\.net$/i,
  /(^|\.)163\.com$/i,
  /(^|\.)gtimg\.cn$/i,
  /(^|\.)y\.qq\.com$/i,
  /(^|\.)kugou\.com$/i,
  /(^|\.)kgimg\.com$/i,
  /(^|\.)kuwo\.cn$/i,
  /(^|\.)kwcdn\.kuwo\.cn$/i,
  /(^|\.)migu\.cn$/i,
  /(^|\.)music\.126\.net$/i,
]

/* B39: 数字参数统一校验 */
function intParam (raw, def, min, max) {
  /* B39: Number('') === 0，会被 clamp 到 min；这里空串直接回默认值 */
  if (raw === null || raw === undefined || String(raw).trim() === '') return def
  const n = Number(raw)
  if (!Number.isFinite(n)) return def
  if (n === 0) return def
  return Math.min(max, Math.max(min, Math.trunc(n)))
}

function readBody (req, limit = 5 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size > limit) {
        /* B31: 先停止接收并让上层回 413，别急着 destroy（socket 没了就没法回包） */
        try { req.pause() } catch (e) { }
        try { req.removeAllListeners('data') } catch (e) { }
        reject(Object.assign(new Error('请求体过大（上限 ' + limit + ' 字节）'), { code: 413 }))
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}
function refererFor (url) {
  const h = new URL(url).hostname
  if (/music\.126\.net|music\.163\.com/.test(h)) return 'https://music.163.com/'
  if (/qq\.com|qqmusic/.test(h)) return 'https://y.qq.com/'
  if (/kuwo\.cn/.test(h)) return 'https://www.kuwo.cn/'
  if (/kugou\.com/.test(h)) return 'https://www.kugou.com/'
  if (/migu\.cn/.test(h)) return 'https://music.migu.cn/'
  return 'https://music.163.com/'
}
function guessExt (contentType, url) {
  const m = /(mp3|flac|m4a|aac|ogg|wav|ape)/i.exec(contentType || '') || /\.(mp3|flac|m4a|aac|ogg|wav|ape)(\?|$)/i.exec(url || '')
  return m ? '.' + m[1].toLowerCase() : '.mp3'
}

/* 音频流代理（支持 Range / 跳转） */
/** 默认下载目录：用户下载文件夹下的 Liusheng */
function defaultDownloadDir () {
  const home = process.env.USERPROFILE || process.env.HOME || '.'
  return path.join(home, 'Downloads', 'Liusheng')
}

function proxyStream (req, res, targetUrl, opts = {}) {
  let u
  try { u = new URL(targetUrl) } catch (e) { return json(res, 400, { error: '无效的音频地址' }) }
  const lib = u.protocol === 'https:' ? https : http
  const headers = { 'User-Agent': UA, Referer: refererFor(targetUrl), Accept: '*/*' }
  if (req.headers.range) headers.Range = req.headers.range

  /* B32: 统一收尾。头已发出时必须 res.destroy()，
     否则播放器会一直转圈等一个永不完结的响应。 */
  let finished = false
  let upstream = null
  const fail = (code, msg) => {
    if (finished) return
    finished = true
    try { if (upstream) upstream.destroy() } catch (e) { }
    if (!res.headersSent) {
      try { json(res, code, { error: msg }) } catch (e) { }
      return
    }
    /* B32: 头已发出时改不了状态码，但可以带上错误名，
           让前端 onAudioError 能判定「已收部分数据后被重置」并换源重试 */
    try { res.destroy(new Error('UPSTREAM_ABORTED')) } catch (e) { }
  }

  upstream = lib.get(u, { headers, timeout: 25000 }, (up) => {
    if (up.statusCode >= 400) {
      up.resume()
      return fail(502, '音频源返回 ' + up.statusCode)
    }
    const outHeaders = {
      'Content-Type': up.headers['content-type'] || 'audio/mpeg',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
    }
    if (up.headers['content-length']) outHeaders['Content-Length'] = up.headers['content-length']
    if (up.headers.location) outHeaders.Location = up.headers.location
    if (up.headers['content-range']) outHeaders['Content-Range'] = up.headers['content-range']
    if (opts.filename) {
      outHeaders['Content-Disposition'] = 'attachment; filename="' + encodeURIComponent(opts.filename) + '"; filename*=UTF-8\'\'' + encodeURIComponent(opts.filename)
    }
    res.writeHead(up.statusCode, outHeaders)
    up.pipe(res)
    up.on('error', () => fail(502, '音频流中断'))
    up.on('aborted', () => fail(502, '音频流被上游中断'))
    res.on('close', () => { finished = true; try { up.destroy() } catch (e) { } })
  })
  upstream.on('error', (e) => fail(502, '音频代理失败: ' + e.message))
  upstream.on('timeout', () => fail(504, '音频源超时'))
  req.on('close', () => { finished = true; try { if (upstream) upstream.destroy() } catch (e) { } })
}

/* 由歌曲 id 构建 LX musicInfo（按平台） */
async function buildMusicInfo (platform, id, extra = {}) {
  if (platform === 'tx') {
    let d = {}
    try { d = await qq.detail(id) } catch (e) {}
    const mediaMid = extra.mediaMid || d.mediaMid || id
    return {
      songmid: String(id),
      songId: (d.raw && d.raw.songId) || 0,
      strMediaMid: mediaMid,
      media_mid: mediaMid,
      name: extra.name || d.name || '未知歌曲',
      singer: extra.singer || d.singer || '未知歌手',
      albumName: extra.album || d.album || '',
      albumMid: (d.raw && d.raw.albumMid) || '',
      interval: extra.interval || d.durationText || '00:00',
      source: 'tx',
      _types: { tx: true },
    }
  }
  if (platform === 'kg') {
    return {
      hash: String(id),
      songmid: String(id),
      name: extra.name || '未知歌曲',
      singer: extra.singer || '未知歌手',
      albumName: extra.album || '',
      interval: extra.interval || '00:00',
      source: 'kg',
      _types: { kg: true },
    }
  }
  let d = {}
  let __detailErr = null
  try { d = await netease.detail(id) } catch (e) { __detailErr = e; console.warn('[meta] 详情失败', id, e.message) }
  return {
    songmid: String(id),
    id: String(id),
    name: extra.name || d.name || '未知歌曲',
    singer: extra.singer || d.singer || '未知歌手',
    /* B38: 元数据缺失时不要拿「未知歌曲」去跨平台搜索 */
    _metaMissing: !(extra.name || d.name),
    _error: __detailErr ? __detailErr.message : '',
    albumName: extra.album || d.album || '',
    albumId: d.cover || '',
    interval: extra.interval || d.durationText || '00:00',
    source: 'wy',
    _types: { wy: true },
  }
}

function extraFromQuery (q) {
  return {
    name: q.get('name') || '',
    singer: q.get('singer') || '',
    album: q.get('album') || '',
    interval: q.get('interval') || '',
    mediaMid: q.get('mediaMid') || '',
  }
}

/* ---------------- 路由 ---------------- */
/* B51: 出口脱敏，不再回显完整 QQ Cookie */
function publicSettings () {
  const out = Object.assign({}, db.settings || {})
  const ck = out.qqCookie
  delete out.qqCookie
  out.qqCookieSet = !!ck
  out.qqCookieTail = ck ? String(ck).slice(-6) : ''
  return out
}

/* 等到「至少一个音源就绪」就返回，不等全部加载完。
   fish 是 640KB 混淆代码，init 最长 12 秒；等全部会让冷启动点歌卡十几秒。 */
async function waitForAnySource (platform, maxMs = 8000) {
  /* P1-1: 必须按平台判。「任一源就绪」不等于「有源支持 wy」——
     冷启动时先就绪的可能是只支持 tx 的源，此时放行会让
     sourceManager.resolveUrl 直接抛「没有可用的音源脚本支持 wy」。 */
  const deadline = Date.now() + maxMs
  while (Date.now() < deadline) {
    try {
      const entries = sourceManager && sourceManager.entries
      if (entries && entries.size > 0) {
        for (const e of entries.values()) {
          if (e.status === 'ok' && e.script) {
            if (!platform) return true
            const srcs = e.sources || (e.script && e.script.sources) || {}
            if (srcs && srcs[platform]) return true
          }
        }
      }
    } catch (err) { }
    await new Promise((r) => setTimeout(r, 150))
  }
  /* 兜底：仍没找到平台源时，再给 loadAll 最多 3 秒，别把「还在加载」报成「没有源」 */
  await Promise.race([
    loadPromise.catch(() => { }),
    new Promise((r) => setTimeout(r, 3000)),
  ])
  return false
}

const routes = {
  async '/api/lan' () {
    const ips = global.__LAN_IPS || []
    return {
      port: PORT,
      ips,
      url: ips.length ? 'http://' + ips[0] + ':' + PORT : 'http://127.0.0.1:' + PORT,
      urls: ips.map((ip) => 'http://' + ip + ':' + PORT),
    }
  },

  async '/api/health' () {
    return {
      ok: true, version: '1.0.32', pid: process.pid, platform: process.platform,
      /* B7: 外壳/前端可以拿这个 token 带 X-Phonograph-Token 头 */
      token: SESSION_TOKEN,
    }
  },

  async '/api/shutdown' (req) {
    if (req.method !== 'POST') throw Object.assign(new Error('仅支持 POST'), { code: 405 })
    /* B5: 退出前同步写盘，避免最后一次修改丢失 */
    try {
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
      writeDbNow()
      console.log('数据已保存')
    } catch (e) { console.error('[db] 退出前保存失败', e.message) }
    setTimeout(() => { console.log('收到退出指令，服务关闭'); process.exit(0) }, 300)
    return { ok: true, message: '服务即将退出' }
  },

  async '/api/search' (req, q) {
    const kw = (q.get('kw') || '').trim()
    if (!kw) throw Object.assign(new Error('缺少搜索关键词'), { code: 400 })
    const page = intParam(q.get('page'), 1, 1, 200) /* B39 */
    const limit = intParam(q.get('limit'), 30, 1, 60) /* B39 */
    const platform = q.get('source') || 'wy'
    if (platform === 'tx') return await qq.search(kw, page, limit)
    if (platform === 'kg') return await kugou.search(kw, page, limit)
    return await netease.search(kw, page, limit)
  },

  async '/api/url' (req, q) {
    const id = q.get('id')
    if (!id) throw Object.assign(new Error('缺少歌曲 id'), { code: 400 })
    const platform = q.get('source') || 'wy'
    const quality = q.get('quality') || db.settings.quality || '320k'
    const cacheKey = platform + '|' + id + '|' + quality + '|' + (q.get('only') || '')
    /* P1: force=1 时跳过缓存 —— 前端「换个音源重试」必须真的重新解析，
       否则拿回的还是同一条已失效的 CDN 直链。 */
    const __force = q.get('force') === '1' || q.get('nocache') === '1'
    if (__force) { urlCache.delete(cacheKey); urlInflight.delete(cacheKey) }
    const hitVal = __force ? null : cacheGet(urlCache, cacheKey)
    if (hitVal) return Object.assign({ id, source: platform, cached: true }, hitVal)
    /* B18: 已有同样的请求在飞，直接复用 */
    if (urlInflight.has(cacheKey)) return urlInflight.get(cacheKey)
    const job = (async () => {
      await waitForAnySource(platform)
    const info = await buildMusicInfo(platform, id, extraFromQuery(q))
    const { result, crossFrom } = await resolveWithCross({
      platform, info, quality,
      only: q.get('only') || '',
      sourceManager, buildMusicInfo,
      libs: { qq, kugou },
    })
    const payload = {
      id, source: platform, quality: result.quality, provider: result.provider,
      sourceId: result.sourceId, url: result.url, attempts: result.attempts,
      crossPlatform: crossFrom || undefined,
    }
      cacheSet(urlCache, cacheKey, payload, 5 * 60e3, 300)
      return payload
    })().finally(() => urlInflight.delete(cacheKey))
    urlInflight.set(cacheKey, job)
    return job
  },

  async '/api/sources/test' (req, q) {
    const id = q.get('id')
    if (!id) throw Object.assign(new Error('缺少歌曲 id'), { code: 400 })
    const platform = q.get('source') || 'wy'
    const info = await buildMusicInfo(platform, id, extraFromQuery(q))
    /* P1: 12 秒总预算，避免 N 个源串行累加导致接口长期挂起 */
    const list = await Promise.race([
      sourceManager.testAll(platform, info, q.get('quality') || db.settings.quality || '320k'),
      new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('音源测试超时'), { code: 504 })), 12000)),
    ])
    return { id, source: platform, list }
  },

  async '/api/stream' (req, q, res) {
    const id = q.get('id')
    if (!id) return json(res, 400, { error: '缺少歌曲 id' })
    const platform = q.get('source') || 'wy'
    const quality = q.get('quality') || db.settings.quality || '320k'

    /* 与 /api/url 走同一条路径：等音源就绪 + 跨平台兜底 + 缓存 */
    const cacheKey = platform + '|' + id + '|' + quality + '|' + (q.get('only') || '')
    let target = ''
    /* P1: 与 /api/url 一致，force=1 时跳过缓存 */
    const __forceS = q.get('force') === '1' || q.get('nocache') === '1'
    if (__forceS) { urlCache.delete(cacheKey); urlInflight.delete(cacheKey) }
    const hitVal = __forceS ? null : cacheGet(urlCache, cacheKey)
    if (hitVal) {
      target = hitVal.url
    } else {
      await waitForAnySource(platform)
      const info = await buildMusicInfo(platform, id, extraFromQuery(q))
      const { result } = await resolveWithCross({
        platform, info, quality,
        only: q.get('only') || '',
        sourceManager, buildMusicInfo,
        libs: { qq, kugou },
      })
      target = result && result.url
      if (target) {
        /* P2: 原来这里用裸 Map.set，绕过了 cacheSet 的 300 条上限与 LRU，
           长期运行会只增不减。 */
        cacheSet(urlCache, cacheKey,
          { id, source: platform, quality: result.quality, provider: result.provider, url: target },
          5 * 60e3, 300)
      }
    }

    if (!target) return json(res, 502, { error: '取不到播放地址，换一首试试' })
    proxyStream(req, res, target)
    return null
  },

  /* 下载目录：查询 / 设置 / 打开 */
  async '/api/download-dir' (req, q) {
    /* P0-1: 这个接口同时承担「读」（GET，返回当前目录）和「写」（?set=/?open=）。
       整条路径塞进 WRITE_PATHS 会让读取也 405，下载目录功能整块失效。
       这里只对写操作要求 POST。 */
    if ((q.get('set') || q.get('open')) && req.method !== 'POST' && req.method !== 'PUT') {
      throw Object.assign(new Error('仅支持 POST'), { code: 405 })
    }
    if (q.get('open')) {
      const dir = db.settings.downloadDir || defaultDownloadDir()
      let openErr = ''
      try {
        fs.mkdirSync(dir, { recursive: true })
        const { spawn } = require('node:child_process')
        const child = spawn('explorer.exe', [dir], { detached: true, stdio: 'ignore' })
        child.on('error', (e2) => { openErr = e2.message })
        child.unref()
      } catch (e) { openErr = e.message }
      return { ok: !openErr, dir, error: openErr || undefined }
    }
    const set = q.get('set')
    /* 区分三种情况：
       - set === null  → 没传，纯读取
       - set 是空串    → 用户清空了输入框，恢复默认目录（前端 placeholder 写着「留空使用 音乐\留声」）
       - set 有值      → 保存新目录 */
    if (set !== null && set !== undefined) {
      if (!set.trim()) {
        delete db.settings.downloadDir
        saveDb()
        const d = defaultDownloadDir()
        return { dir: d, writable: true, default: d, reset: true }
      }
      const dir = set.trim()
      /* 只拦「真的用不了」的两种情况：建不出来、或同名文件占位。
         写探测不做拦截 —— 它会误报（杀软/受控文件夹/权限策略都会让 open 拿到 EPERM），
         实测本机 D:\音乐 用 PowerShell 能写、用 Node open 却报 EPERM，
         而真实下载走的是另一条路径。拿探测结果阻止保存会把正常目录挡在外面。 */
      let mkErr = ''
      try {
        fs.mkdirSync(dir, { recursive: true })
        if (!fs.statSync(dir).isDirectory()) mkErr = '该路径已存在且不是文件夹'
      } catch (e) {
        mkErr = String((e && e.message) || e).replace(/^[A-Z]+:\s*/, '')
      }
      if (mkErr) {
        throw Object.assign(new Error('目录无法使用：' + mkErr), { code: 400 })
      }
      db.settings.downloadDir = dir
      saveDb()
      return { dir, writable: true, default: defaultDownloadDir() }
    }
    const dir = db.settings.downloadDir || defaultDownloadDir()
    /* 读取时不做写探测：这个值前端只拿去显示，误报会让用户以为坏了 */
    let writable = true
    try {
      fs.mkdirSync(dir, { recursive: true })
      writable = fs.statSync(dir).isDirectory()
    } catch (e) { writable = false }
    return { dir, writable, default: defaultDownloadDir() }
  },

  /* 已下载文件列表：扫所有候选目录 */
  async '/api/downloads' (req, q) {
    const dirs = [...new Set([
      db.settings.downloadDir,
      defaultDownloadDir(),
      path.join(ROOT, 'downloads'),
    ].filter(Boolean))]

    const map = new Map()
    for (const d of dirs) {
      try {
        for (const f of fs.readdirSync(d)) {
          if (!/\.(mp3|flac|m4a|ogg|wav)$/i.test(f)) continue
          let st = null
          try { st = fs.statSync(path.join(d, f)) } catch (e) { continue }
          const key = f
          const prev = map.get(key)
          if (!prev || st.mtimeMs > prev.mtime) {
            map.set(key, { name: f, size: st.size, mtime: st.mtimeMs, dir: d })
          }
        }
      } catch (e) { }
    }
    const files = [...map.values()].sort((a, b) => b.mtime - a.mtime)
    return { dir: dirs[0] || '', dirs, files }
  },

  /* 打开文件所在文件夹并选中 */
  async '/api/downloads/reveal' (req, q) {
    /* B15: 与 remove 同一套校验，且不回显绝对路径 */
    const name = q.get('name')
    if (!name) throw Object.assign(new Error('缺少文件名'), { code: 400 })
    if (name.includes('..') || /[\\/]/.test(name)) {
      throw Object.assign(new Error('非法文件名'), { code: 400 })
    }
    if (!/\.(mp3|flac|m4a|ogg|wav)$/i.test(name)) {
      throw Object.assign(new Error('只能定位音频文件'), { code: 400 })
    }
    const roots = [...new Set([
      db.settings.downloadDir,
      defaultDownloadDir(),
      path.join(ROOT, 'downloads'),
    ].filter(Boolean))].map((d) => { try { return path.resolve(d) } catch (e) { return d } })

    let full = ''
    for (const root of roots) {
      const cand = path.resolve(root, name)
      if (!cand.startsWith(root + path.sep)) continue
      if (fs.existsSync(cand)) { full = cand; break }
    }
    if (!full) return { ok: false, error: '文件不存在' }
    try {
      const { spawn } = require('node:child_process')
      const child = spawn('explorer.exe', ['/select,', full], { detached: true, stdio: 'ignore' })
      child.on('error', () => { })
      child.unref()
      return { ok: true, name }
    } catch (e) {
      return { ok: false, error: '打开失败：' + e.message }
    }
  },

  /* 删除已下载文件 */
  async '/api/downloads/remove' (req, q) {
    const name = q.get('name')
    if (!name) throw Object.assign(new Error('缺少文件名'), { code: 400 })
    /* B10: 只允许删音频扩展名，且必须属于扫描目录白名单 */
    if (!/\.(mp3|flac|m4a|ogg|wav)$/i.test(name)) {
      throw Object.assign(new Error('只能删除音频文件'), { code: 400 })
    }
    if (name.includes('..') || name.includes('/') || name.includes('\\')) {
      throw Object.assign(new Error('非法文件名'), { code: 400 })
    }
    const candidates = [...new Set([
      db.settings.downloadDir,
      defaultDownloadDir(),
      path.join(ROOT, 'downloads'),

    ].filter(Boolean))]
    let removed = ''
    for (const d of candidates) {
      const full = path.join(d, name)
      /* 严格边界：用 path.relative 判断是否逃逸 */
      const rel = path.relative(d, full)
      if (rel.startsWith('..') || path.isAbsolute(rel)) continue
      if (!fs.existsSync(full)) continue
      try { fs.unlinkSync(full); removed = full } catch (e) { }
      if (removed) break
    }
    if (!removed) throw Object.assign(new Error('文件不存在或删除失败'), { code: 404 })
    return { ok: true, name }    /* P1-3: 不回显绝对路径 */
  },

  async '/api/download' (req, q, res) {
    /* P1: save=1 会往用户磁盘写文件，必须 POST。
       否则任何网页用一个 <img src="...&save=1"> 就能触发（跨站 GET 不带 Origin）。 */
    if (q.get('save') === '1' && req.method !== 'POST' && req.method !== 'PUT') {
      throw Object.assign(new Error('保存下载需要 POST'), { code: 405 })
    }
    const id = q.get('id')
    if (!id) return json(res, 400, { error: '缺少歌曲 id' })
    const platform = q.get('source') || 'wy'
    const quality = q.get('quality') || db.settings.quality || '320k'
    const info = await buildMusicInfo(platform, id, extraFromQuery(q))
    const { result } = await resolveWithCross({
      platform, info, quality,
      only: q.get('only') || '',
      sourceManager, buildMusicInfo,
      libs: { qq, kugou },
    })
    const baseName = (info.name + ' - ' + info.singer).replace(/[\\/:*?"<>|]/g, '_').slice(0, 80)

    /* save=1：先抓到程序可写目录，再用 PowerShell 复制到目标目录（绕过 Node 写限制） */
    if (q.get('save') === '1') {
      const wantFmt = q.get('format') === 'flac' ? 'flac' : 'mp3'
      const baseName2 = (info.name + ' - ' + info.singer).replace(/[\\/:*?"<>|\r\n]/g, '_').slice(0, 80)

      /* 1) 下载到程序目录（一定可写） */
      const dataDir = path.join(ROOT, 'data')
      try { fs.mkdirSync(dataDir, { recursive: true }) } catch (e) { }
      const tmpFile = path.join(dataDir, '.dl_' + Date.now() + '.' + wantFmt)
      try {
        const resp = await fetch(result.url, {
          headers: { 'User-Agent': UA, Referer: refererFor(result.url), Accept: '*/*' },
        })
        if (!resp.ok) return json(res, 502, { error: '音频源返回 ' + resp.status })
        /* B40: 流式落盘，不再 arrayBuffer() 全量读内存（大 flac 会 OOM）；同时限 400MB */
        const { Readable, Transform } = require('node:stream')
        const { pipeline } = require('node:stream/promises')
        let written = 0
        const limiter = new Transform({
          transform (chunk, enc, cb) {
            written += chunk.length
            if (written > 400 * 1024 * 1024) return cb(new Error('文件超过 400MB，已中止'))
            cb(null, chunk)
          },
        })
        await pipeline(Readable.fromWeb(resp.body), limiter, fs.createWriteStream(tmpFile))
        if (written < 4096) {
          try { fs.unlinkSync(tmpFile) } catch (e) { }
          return json(res, 502, { error: '音频内容为空' })
        }
      } catch (e) {
        try { fs.unlinkSync(tmpFile) } catch (e2) { }
        return json(res, 502, { error: '下载失败：' + (e.message || e) })
      }

      /* 2) 判断真实格式，定文件名 */
      let rawFmt = 'unknown'
      try {
        const fd = fs.openSync(tmpFile, 'r')
        const b = Buffer.alloc(16)
        fs.readSync(fd, b, 0, 16, 0)
        fs.closeSync(fd)
        rawFmt = transcoder.sniffFormat(b)
      } catch (e) { }
      /* 2.5) 格式不一致就转码（用 ffmpeg，异步 + 超时，失败则保留原格式） */
      let finalTmp = tmpFile
      if (rawFmt !== 'unknown' && rawFmt !== wantFmt && transcoder.available()) {
        const convOut = tmpFile + '.' + wantFmt
        try {
          const okConv = await transcoder.transcodeAsync(tmpFile, wantFmt, convOut, 120000)
          if (okConv) {
            try { fs.unlinkSync(tmpFile) } catch (e) { }
            finalTmp = convOut
            rawFmt = wantFmt
          }
        } catch (e) { }
      }
      const targetName = baseName2 + '.' + (rawFmt === 'unknown' ? wantFmt : rawFmt)

      /* 3) 依次尝试候选目录，用 PowerShell 复制（它有写权限） */
      const cands = []
      if (db.settings.downloadDir) cands.push(db.settings.downloadDir)
      cands.push(defaultDownloadDir())
      cands.push(path.join(ROOT, 'downloads'))
      const dirs = [...new Set(cands.filter(Boolean))]

      const { spawn } = require('node:child_process')
      const psCopy = (src, dst) => new Promise((resolve) => {
        const esc = (x) => String(x).split("'").join("'" + "'")
        const cmd = 'Copy-Item -LiteralPath ' + "'" + esc(src) + "'" + ' -Destination ' + "'" + esc(dst) + "'" + ' -Force'
        const c = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', cmd], { windowsHide: true })
        c.on('error', () => resolve(false))
        c.on('close', (code) => {
          try { resolve(code === 0 && fs.existsSync(dst) && fs.statSync(dst).size > 4096) } catch (e) { resolve(false) }
        })
      })

      let finalPath = ''
      let usedDir = ''
      for (const d of dirs) {
        try { fs.mkdirSync(d, { recursive: true }) } catch (e) { }
        const dest = path.join(d, targetName)
        if (await psCopy(finalTmp, dest)) { finalPath = dest; usedDir = d; break }
      }
      /* B34: 两个临时文件都要清 —— 转码成功时 finalTmp 是 convOut，
         原来只删了 tmpFile，convOut 就永久留在 data/ 里（和下载文件一样大） */
      /* B34: 转码失败时 finalTmp 还是 tmpFile，convOut 半成品会漏掉 */
      for (const f of new Set([tmpFile, finalTmp, tmpFile + '.' + wantFmt])) {
        if (!f) continue
        try { if (path.resolve(f).startsWith(path.resolve(ROOT, 'data'))) fs.unlinkSync(f) } catch (e) { }
      }

      if (!finalPath) return json(res, 502, { error: '所有候选目录都写不进去' })
      let size = 0
      try { size = fs.statSync(finalPath).size } catch (e) { }
      try { transcoder.unblockFile(finalPath) } catch (e) { }
      return json(res, 200, { ok: true, path: finalPath, size, name: targetName, dir: usedDir })
    }
    const filename = baseName + guessExt('', result.url)
    proxyStream(req, res, result.url, { filename })
    return null
  },

  async '/api/toplist' (req, q) {
    const platform = q.get('source') || 'wy'
    const type = q.get('type') || 'hot'
    if (platform === 'tx') return await qq.toplist(type)
    if (platform === 'kg') return await kugou.toplist(type)
    return await netease.toplist(type)
  },

  async '/api/discover' (req, q) {
    const platform = q.get('source') || 'wy'
    const offset = intParam(q.get('offset'), 0, 0, 100000)    /* B39 */
    const limit = intParam(q.get('limit'), 30, 6, 60)
    if (platform === 'tx') {
      const playlists = await qq.recommendPlaylists(offset, limit).catch(() => [])
      return { platform, offset, playlists, newSongs: [] }
    }
    if (platform === 'kg') {
      const playlists = await kugou.recommendPlaylists(offset, limit)
      return { platform, offset, playlists, newSongs: [] }
    }
    const playlists = await netease.recommendPlaylists(offset, limit).catch(() => [])
    return { platform, offset, playlists, newSongs: [] }
  },

  async '/api/lyric' (req, q) {
    const id = q.get('id')
    if (!id) throw Object.assign(new Error('缺少歌曲 id'), { code: 400 })
    const platform = q.get('source') || 'wy'
    if (platform === 'tx') return await qq.lyric(id)
    if (platform === 'kg') return await kugou.lyric(id, q.get('interval') || '')
    return await netease.lyric(id)
  },

  async '/api/pic' (req, q, res) {
    const direct = q.get('url')
    if (direct) {
      /* B6: 只允许 http(s) + 已知 CDN + 非私有地址，否则就是任意 URL 代理（SSRF） */
      if (!/^https?:\/\//i.test(direct)) return json(res, 400, { error: '无效地址' })
      let uu = null
      try { uu = new URL(direct) } catch (e) { return json(res, 400, { error: '非法 URL' }) }
      if (isPrivateHost(uu.hostname)) return json(res, 403, { error: '不允许的图片地址' })
      if (!PIC_HOST_ALLOW.some((re) => re.test(uu.hostname))) {
        return json(res, 403, { error: '不是已知封面域名：' + uu.hostname })
      }
      proxyStream(req, res, direct)
      return null
    }
    const id = q.get('id')
    if (!id) return json(res, 400, { error: '缺少歌曲 id' })
    const platform = q.get('source') || 'wy'
    let url = ''
    if (platform === 'tx') url = await qq.pic({ picId: id })
    else if (platform === 'kg') url = await kugou.pic({ cover: id })
    else url = await netease.pic(id)
    if (!url) return json(res, 404, { error: '无封面' })
    proxyStream(req, res, url)
    return null
  },

  async '/api/sources' () {
    return { list: sourceManager.list(), defaultOrder: sourceManager.config.sourceOrder || [] }
  },

  async '/api/sources/reload' (req, q, res, body) {
    const id = (body && body.id) || q.get('id')
    if (!id) {
      await sourceManager.loadAll()
      return { list: sourceManager.list() }
    }
    await sourceManager.reload(id)
    return { list: sourceManager.list() }
  },

  async '/api/sources/import' (req, q, res, body) {
    const { name, url, code } = body || {}
    let sourceCode = code
    if (!sourceCode && url) {
      const r = await new Promise((resolve, reject) => {
        const u = new URL(url)
        const lib = u.protocol === 'https:' ? https : http
        lib.get(u, { headers: { 'User-Agent': UA }, timeout: 20000 }, (resp) => {
          if (resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) {
            resp.resume()
            return resolve(fetchText(new URL(resp.headers.location, u).toString()))
          }
          const c = []
          resp.on('data', (d) => c.push(d))
          resp.on('end', () => resolve(Buffer.concat(c).toString('utf8')))
        }).on('error', reject)
      })
      sourceCode = r
    }
    if (!sourceCode) throw Object.assign(new Error('缺少脚本内容'), { code: 400 })
    const file = sourceManager.install(name || 'imported-' + Date.now(), sourceCode)
    /* P1: install() 只写文件、不注册 entry，所以 reload(id) 必然抛「音源不存在」。
       新文件直接 loadOne，它会 init 并写进 entries。 */
    await sourceManager.loadOne(file)
    return { list: sourceManager.list(), file }
  },

  async '/api/sources/remove' (req, q, res, body) {
    const id = (body && body.id) || q.get('id')
    sourceManager.remove(id)
    return { list: sourceManager.list() }
  },

  async '/api/sources/toggle' (req, q, res, body) {
    const { id, enabled } = body || {}
    const disabled = new Set(db.settings.disabledSources || [])
    if (enabled) disabled.delete(id); else disabled.add(id)
    db.settings.disabledSources = [...disabled]
    for (const e of sourceManager.entries.values()) e.enabled = sourceManager.enabledOf(e.id)
    saveDb()
    return { list: sourceManager.list() }
  },

  async '/api/settings' (req, q, res, body) {
    if (body) {
      /* B51: 脱敏后前端拿不到 qqCookie，输入框永远是空的。
         用户点保存会提交 {qqCookie: ''}，把真 Cookie 洗掉。
         这里做「空值不覆盖」。 */
      /* P2: 只接受已知键。原来 Object.assign 任意键直落，
         可以绕过 /api/download-dir 的目录校验写坏 downloadDir。 */
      const ALLOW = ['quality', 'platform', 'volume', 'sourceOrder', 'disabledSources', 'qqCookie',
        'theme', 'themeMode', 'sleepMinutes', 'dlFormat', 'themeFromCover']
      const patch = {}
      for (const k of ALLOW) {
        if (body && Object.prototype.hasOwnProperty.call(body, k)) patch[k] = body[k]
      }
      /* downloadDir 走独立校验：必须能创建且可写，否则 400 */
      if (body && typeof body.downloadDir === 'string') {
        const dir = body.downloadDir.trim()
        if (dir) {
          let mkErr = ''
          try { fs.mkdirSync(dir, { recursive: true }) } catch (err2) { mkErr = err2.code + ': ' + err2.message }
          if (mkErr) throw Object.assign(new Error('目录无法创建（' + mkErr + '）'), { code: 400 })
          let wErr = ''
          try {
            const probe = path.join(dir, 'w_test.tmp')
            fs.writeFileSync(probe, 'ok')
            fs.unlinkSync(probe)
          } catch (err3) { wErr = err3.code + ': ' + err3.message }
          if (wErr) throw Object.assign(new Error('目录不可写（' + wErr + '）'), { code: 400 })
          patch.downloadDir = dir
        } else {
          patch.downloadDir = ''
        }
      }
      /* P3-5: 显式清空用 clearQqCookie，空串仍然表示「不修改」 */
      if (body && body.clearQqCookie === true) {
        patch.qqCookie = ''
      } else if (patch.qqCookie === undefined || patch.qqCookie === '' || patch.qqCookie === null) {
        delete patch.qqCookie
      }
      Object.assign(db.settings, patch)
      sourceManager.config = db.settings
      for (const e of sourceManager.entries.values()) e.enabled = sourceManager.enabledOf(e.id)
      /* QQ 音源登录信息即时生效 */
      try { qq.setCookie(db.settings.qqCookie || '') } catch (e) { }
      saveDb()
    }
    return publicSettings()
  },

  async '/api/db' () {
    return { playlists: db.playlists, settings: publicSettings(), history: db.history }
  },

  async '/api/playlist' (req, q, res, body) {
    /* B30: action 可以来自 query，但后面全程强解 b.* —— body 为 null 时 500。
       这里统一归一化：body 为空就用 query 拼一个对象。 */
    const b = body || Object.fromEntries(q.entries())
    const action = b.action
    const WRITE_ACTIONS = new Set(['import', 'create', 'rename', 'delete', 'add', 'remove', 'clear'])
    if (WRITE_ACTIONS.has(action) && req.method !== 'POST') {
      throw Object.assign(new Error('仅支持 POST'), { code: 405 })
    }
    if (!action) return { playlists: db.playlists }
    if (action === 'preview') {
      const url = (b && b.url) || q.get('url')
      if (!url) throw Object.assign(new Error('缺少歌单链接'), { code: 400 })
      const r = await importPlaylist(url)
      return {
        preview: {
          name: r.name,
          count: (r.songs || []).length,
          total: r.total,
          truncated: !!r.truncated,
          timedOut: !!r.timedOut,
          platform: r.platform,
          cover: r.cover || '',
        },
        songs: r.songs || [],
      }
    }
    if (action === 'import') {
      const url = (b && b.url) || q.get('url')
      if (!url) throw Object.assign(new Error('缺少歌单链接'), { code: 400 })
      const r = await importPlaylist(url)
      const pl = {
        id: 'pl' + Date.now(),
        name: r.name || '导入歌单',
        songs: r.songs || [],
        platform: r.platform,
        cover: r.cover || '',
      }
      db.playlists.push(pl)
      saveDb()
      return { playlists: db.playlists, imported: { id: pl.id, name: pl.name, count: pl.songs.length, total: r.total, truncated: !!r.truncated, timedOut: !!r.timedOut, skipped: r.skipped || 0, platform: r.platform } }
    }
    if (action === 'create') {
      const p = { id: 'pl' + Date.now(), name: (b && b.name) || '新建歌单', songs: [] }
      db.playlists.push(p); saveDb()
      return { playlists: db.playlists, id: p.id }
    }
    if (action === 'rename') {
      const p = db.playlists.find((x) => x.id === b.id)
      if (p) { p.name = b.name; saveDb() }
      return { playlists: db.playlists }
    }
    if (action === 'delete') {
      db.playlists = db.playlists.filter((x) => x.id !== b.id)
      if (!db.playlists.length) db.playlists = [{ id: 'default', name: '默认列表', songs: [] }]
      saveDb()
      return { playlists: db.playlists }
    }
    if (action === 'add') {
      const p = db.playlists.find((x) => x.id === (b.listId || 'default'))
      if (p && b.song && !p.songs.some((s) => s.id === b.song.id && (s.source || 'wy') === (b.song.source || 'wy'))) { p.songs.push(b.song); saveDb() }
      return { playlists: db.playlists }
    }
    if (action === 'remove') {
      const p = db.playlists.find((x) => x.id === (b.listId || 'default'))
      if (p) { p.songs = p.songs.filter((s) => s.id !== b.id); saveDb() }
      return { playlists: db.playlists }
    }
    if (action === 'clear') {
      const p = db.playlists.find((x) => x.id === (b.listId || 'default'))
      if (p) { p.songs = []; saveDb() }
      return { playlists: db.playlists }
    }
    return { playlists: db.playlists }
  },
}

function fetchText (url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const lib = u.protocol === 'https:' ? https : http
    lib.get(u, { headers: { 'User-Agent': UA }, timeout: 20000 }, (resp) => {
      if (resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) {
        resp.resume()
        return resolve(fetchText(new URL(resp.headers.location, u).toString()))
      }
      const c = []
      resp.on('data', (d) => c.push(d))
      resp.on('end', () => resolve(Buffer.concat(c).toString('utf8')))
    }).on('error', reject)
  })
}

function serveStatic (req, res, pathname) {
  /* B33: 畸形百分号编码（/%E0%A4%A）会抛 URIError，落进外层 catch 变 500 */
  let rel
  try {
    rel = decodeURIComponent(pathname === '/' ? '/index.html' : pathname)
  } catch (e) {
    return json(res, 400, { error: '非法请求路径' })
  }
  const full = path.join(PUBLIC, rel.replace(/^\/+/, ''))
  /* S4: 用 path.relative 判断，避免 public2/ 这类兄弟前缀绕过 */
  const __rel = path.relative(PUBLIC, full)
  if (__rel.startsWith('..') || path.isAbsolute(__rel)) return json(res, 403, { error: '禁止访问' })
  fs.readFile(full, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      return res.end('404 Not Found')
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' })
    res.end(buf)
  })
}

const server = http.createServer(async (req, res) => {
  /* B33: new URL 原来在 try 外面，畸形请求行（//、http://[::1）会抛未处理拒绝，
     客户端拿不到任何响应、连接悬挂。挪进 try，失败回 400。 */
  let u
  try {
    u = new URL(req.url || '/', 'http://127.0.0.1')
  } catch (e) {
    return json(res, 400, { error: '非法请求路径' })
  }
  const pathname = u.pathname
  try {
    if (pathname.startsWith('/api/')) {
      const handler = routes[pathname]
      if (!handler) return json(res, 404, { error: '接口不存在' })

      /* B7/B44: 同源校验 + 写接口强制 POST。
         - 所有 /api/* 校验 Origin（防恶意网页跨站打本地端口）
         - 破坏性接口额外要求 POST
         - 允许通过 X-Phonograph-Token 携带会话令牌（可选，外壳注入） */
      const WRITE_PATHS = new Set([
        '/api/sources/toggle', '/api/sources/reload', '/api/sources/remove',
        '/api/sources/import', '/api/playlist', '/api/shutdown',
        '/api/downloads/remove',
        '/api/downloads/reveal',
        '/api/sources/test',
        '/api/download',
      ])
      /* B7: 统一守卫（Origin + 可选 token）。token 由外壳通过 env 注入，
         前端可以用 X-Phonograph-Token 带；不带也放行（本地单机场景） */
      if (!guard(req, res, false)) return
      /* B30: /api/playlist 的 preview / list 是只读的，GET 也要放行 */
      const READ_ACTIONS = new Set(['preview', 'list', ''])
      const isPlaylistRead = pathname === '/api/playlist' && READ_ACTIONS.has(u.searchParams.get('action') || '')
      if (WRITE_PATHS.has(pathname) && req.method !== 'POST' && req.method !== 'PUT' && !isPlaylistRead) {
        return json(res, 405, { error: '仅支持 POST' })
      }

      /* P0-2: 写接口必须是 application/json。
         浏览器发 text/plain 的 POST 属于 CORS「简单请求」，不发预检、请求真的会到本机；
         要求 JSON 后，跨站要发 JSON 就必须过预检，而预检会因为我们不回 CORS 头而失败。 */
      const isWrite = (req.method === 'POST' || req.method === 'PUT')
      if (isWrite) {
        const ct = String(req.headers['content-type'] || '').toLowerCase()
        if (WRITE_PATHS.has(pathname) || pathname === '/api/settings' || pathname === '/api/download') {
          if (!ct.startsWith('application/json')) {
            return json(res, 415, { error: '写接口需要 application/json' })
          }
        }
      }
      let body = null
      if (req.method === 'POST' || req.method === 'PUT') {
        const raw = await readBody(req)
        if (raw) { try { body = JSON.parse(raw) } catch (e) { body = null } }
      }
      const out = await handler(req, u.searchParams, res, body)
      if (out !== null && out !== undefined && !res.headersSent) return json(res, 200, out)
      return
    }
    serveStatic(req, res, pathname)
  } catch (e) {
    /* P2-1: socket 类错误的 code 是字符串（ECONNRESET/ETIMEDOUT），
       直接传给 writeHead 会抛 Invalid status code，响应永远发不出去 */
    const __n = Number(e && e.code)
    const __code = (Number.isInteger(__n) && __n >= 400 && __n <= 599) ? __n : 500
    if (!res.headersSent) json(res, __code, { error: e.message || '服务器内部错误', attempts: e.attempts || undefined })
    else { try { res.end() } catch (err) {} }
  }
})

/* S1: 默认只监听本机；要开局域网请设 PHONOGRAPH_LAN=1 */
/* B34: 启动时清扫 24h 前的下载临时文件 */
function __cleanupTmp () {
  try {
    const dir = path.join(ROOT, 'data')
    for (const f of fs.readdirSync(dir)) {
      if (!f.startsWith('.dl_')) continue
      const fp = path.join(dir, f)
      try { if (Date.now() - fs.statSync(fp).mtimeMs > 864e5) fs.unlinkSync(fp) } catch (e) { }
    }
  } catch (e) { }
}
__cleanupTmp()

/* B46: 端口占用时不要静默崩，给外壳一个明确的退出码 */
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error('[启动] 端口 ' + PORT + ' 已被占用（可能已有一个实例在跑）')
    process.exit(2)
  }
  console.error('[启动] 监听失败', e.message)
  process.exit(1)
})
server.listen(PORT, process.env.PHONOGRAPH_LAN === '1' ? '0.0.0.0' : '127.0.0.1', () => {
  const os = require('node:os')
  const ips = []
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) ips.push(i.address)
  }
  global.__LAN_IPS = ips
  console.log('=========================================')
  console.log('  留声 已启动  http://127.0.0.1:' + PORT)
  console.log('  手机访问   ' + (ips[0] ? 'http://' + ips[0] + ':' + PORT : '(未检测到局域网地址)'))
  console.log('  数据目录   ' + DATA)
  console.log('=========================================')
})

/* B41: 所有退出路径都落盘 */
function shutdownGracefully (code) {
  try { flushDb() } catch (e) { }
  try { server.close() } catch (e) { }
  process.exit(code || 0)
}
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  try { process.on(sig, () => shutdownGracefully(0)) } catch (e) { }
}
/* P0-2: 兜底，后台回调的意外异常不应该让整个播放器退出 */
process.on('uncaughtException', (e) => {
  try { console.error('[fatal] 未捕获异常:', e && e.stack ? e.stack : e) } catch (err) { }
})

process.on('exit', () => { try { flushDb() } catch (e) { } })
module.exports = { server, db, sourceManager }
