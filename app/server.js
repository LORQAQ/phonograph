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
        const bak = DB_FILE + '.bak'
        fs.copyFileSync(DB_FILE, bak)
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
function saveDb () {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try { writeDbNow() } catch (e) { console.warn('保存数据失败', e.message) }
  }, 300)
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
const sourceManager = new SourceManager(path.join(ROOT, 'sources'), db.settings)
/* QQ 歌单需要登录：把之前保存的 Cookie 注入 */
try { if (db.settings.qqCookie) qq.setCookie(db.settings.qqCookie) } catch (e) { }
const loadPromise = sourceManager.loadAll().then(() => {
  const ok = sourceManager.list().filter((s) => s.status === 'ok')
  console.log('[音源] 已加载 ' + sourceManager.list().length + ' 个脚本，可用 ' + ok.length + ' 个：' + ok.map((s) => s.name).join('、'))
})

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
function readBody (req, limit = 5 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('请求体过大')); req.destroy(); return } chunks.push(c) })
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
  const upstream = lib.get(u, { headers, timeout: 25000 }, (up) => {
    if (up.statusCode >= 400) {
      up.resume()
      return json(res, 502, { error: '音频源返回 ' + up.statusCode })
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
    up.on('error', () => { try { res.destroy() } catch (e) {} })
  })
  upstream.on('error', (e) => { if (!res.headersSent) json(res, 502, { error: '音频代理失败: ' + e.message }) })
  upstream.on('timeout', () => { upstream.destroy(); if (!res.headersSent) json(res, 504, { error: '音频源超时' }) })
  req.on('close', () => { try { upstream.destroy() } catch (e) {} })
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
  try { d = await netease.detail(id) } catch (e) {}
  return {
    songmid: String(id),
    id: String(id),
    name: extra.name || d.name || '未知歌曲',
    singer: extra.singer || d.singer || '未知歌手',
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

  async '/api/health' () { return { ok: true, version: '1.0.0', pid: process.pid, platform: process.platform } },

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
    const page = Number(q.get('page') || 1)
    const limit = Math.min(60, Number(q.get('limit') || 30))
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
    const hit = urlCache.get(cacheKey)
    if (hit && hit.exp > Date.now()) return Object.assign({ id, source: platform, cached: true }, hit.value)
    await loadPromise.catch(() => {})
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
    urlCache.set(cacheKey, { value: payload, exp: Date.now() + 5 * 60e3 })
    if (urlCache.size > 300) urlCache.delete(urlCache.keys().next().value)
    return payload
  },

  async '/api/sources/test' (req, q) {
    const id = q.get('id')
    if (!id) throw Object.assign(new Error('缺少歌曲 id'), { code: 400 })
    const platform = q.get('source') || 'wy'
    const info = await buildMusicInfo(platform, id, extraFromQuery(q))
    const list = await sourceManager.testAll(platform, info, q.get('quality') || db.settings.quality || '320k')
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
    const hit = urlCache.get(cacheKey)
    if (hit && hit.exp > Date.now()) {
      target = hit.value.url
    } else {
      await loadPromise.catch(() => { })
      const info = await buildMusicInfo(platform, id, extraFromQuery(q))
      const { result } = await resolveWithCross({
        platform, info, quality,
        only: q.get('only') || '',
        sourceManager, buildMusicInfo,
        libs: { qq, kugou },
      })
      target = result && result.url
      if (target) {
        urlCache.set(cacheKey, {
          value: { id, source: platform, quality: result.quality, provider: result.provider, url: target },
          exp: Date.now() + 5 * 60e3,
        })
        if (urlCache.size > 300) urlCache.delete(urlCache.keys().next().value)
      }
    }

    if (!target) return json(res, 502, { error: '取不到播放地址，换一首试试' })
    proxyStream(req, res, target)
    return null
  },

  /* 下载目录：查询 / 设置 / 打开 */
  async '/api/download-dir' (req, q) {
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
    if (set && set.trim()) {
      const dir = set.trim()
      try { fs.mkdirSync(dir, { recursive: true }) } catch (e) { }
      db.settings.downloadDir = dir
      saveDb()
      /* 顺便报告当前进程能否写（不阻止保存） */
      let writable = true
      let errMsg = ''
      try {
        const probe = path.join(dir, 'w_test.tmp')
        fs.writeFileSync(probe, 'ok')
        fs.unlinkSync(probe)
      } catch (e) {
        writable = false
        errMsg = e.message
      }
      return { dir, writable, error: errMsg || undefined, default: defaultDownloadDir() }
    }
    const dir = db.settings.downloadDir || defaultDownloadDir()
    let writable = true
    try {
      fs.mkdirSync(dir, { recursive: true })
      const probe = path.join(dir, 'w_test.tmp')
      fs.writeFileSync(probe, 'ok')
      fs.unlinkSync(probe)
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
    const name = q.get('name')
    if (!name) throw Object.assign(new Error('缺少文件名'), { code: 400 })
    const dir = (q.get('dir') || db.settings.downloadDir || defaultDownloadDir())
    const full = path.join(dir, name)
    if (!fs.existsSync(full)) return { ok: false, error: '文件不存在：' + full, path: full }
    let err = ''
    try {
      const { spawn } = require('node:child_process')
      const c = spawn('explorer.exe', ['/select,' + full], { detached: true, stdio: 'ignore' })
      c.on('error', (e) => { err = e.message })
      c.unref()
    } catch (e) { err = e.message }
    return { ok: !err, path: full, dir, error: err || undefined }
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
      q.get('dir') || '',
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
    return { ok: true, path: removed }
  },

  async '/api/download' (req, q, res) {
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
        const buf = Buffer.from(await resp.arrayBuffer())
        if (buf.length < 4096) return json(res, 502, { error: '音频内容为空' })
        fs.writeFileSync(tmpFile, buf)
      } catch (e) {
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
      try { fs.unlinkSync(tmpFile) } catch (e) { }

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
    const offset = Math.max(0, Number(q.get('offset') || 0))
    const limit = Math.min(60, Math.max(6, Number(q.get('limit') || 30)))
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
      if (!/^https?:\/\//.test(direct)) return json(res, 400, { error: '无效地址' })
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
    const id = file.replace(/\.js$/i, '')
    await sourceManager.reload(id)
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
      Object.assign(db.settings, body)
      sourceManager.config = db.settings
      for (const e of sourceManager.entries.values()) e.enabled = sourceManager.enabledOf(e.id)
      /* QQ 音源登录信息即时生效 */
      try { qq.setCookie(db.settings.qqCookie || '') } catch (e) { }
      saveDb()
    }
    return db.settings
  },

  async '/api/db' () {
    return { playlists: db.playlists, settings: db.settings, history: db.history }
  },

  async '/api/playlist' (req, q, res, body) {
    const action = q.get('action') || (body && body.action)
    if (!action) return { playlists: db.playlists }
    if (action === 'preview') {
      const url = (body && body.url) || q.get('url')
      if (!url) throw Object.assign(new Error('缺少歌单链接'), { code: 400 })
      const r = await importPlaylist(url)
      return {
        preview: { name: r.name, count: (r.songs || []).length, platform: r.platform, cover: r.cover || '' },
        songs: r.songs || [],
      }
    }
    if (action === 'import') {
      const url = (body && body.url) || q.get('url')
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
      return { playlists: db.playlists, imported: { id: pl.id, name: pl.name, count: pl.songs.length, platform: r.platform } }
    }
    if (action === 'create') {
      const p = { id: 'pl' + Date.now(), name: (body && body.name) || '新建歌单', songs: [] }
      db.playlists.push(p); saveDb()
      return { playlists: db.playlists, id: p.id }
    }
    if (action === 'rename') {
      const p = db.playlists.find((x) => x.id === body.id)
      if (p) { p.name = body.name; saveDb() }
      return { playlists: db.playlists }
    }
    if (action === 'delete') {
      db.playlists = db.playlists.filter((x) => x.id !== body.id)
      if (!db.playlists.length) db.playlists = [{ id: 'default', name: '默认列表', songs: [] }]
      saveDb()
      return { playlists: db.playlists }
    }
    if (action === 'add') {
      const p = db.playlists.find((x) => x.id === (body.listId || 'default'))
      if (p && body.song && !p.songs.some((s) => s.id === body.song.id && (s.source || 'wy') === (body.song.source || 'wy'))) { p.songs.push(body.song); saveDb() }
      return { playlists: db.playlists }
    }
    if (action === 'remove') {
      const p = db.playlists.find((x) => x.id === (body.listId || 'default'))
      if (p) { p.songs = p.songs.filter((s) => s.id !== body.id); saveDb() }
      return { playlists: db.playlists }
    }
    if (action === 'clear') {
      const p = db.playlists.find((x) => x.id === (body.listId || 'default'))
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
  let rel = decodeURIComponent(pathname === '/' ? '/index.html' : pathname)
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
  const u = new URL(req.url, 'http://127.0.0.1')
  const pathname = u.pathname
  try {
    if (pathname.startsWith('/api/')) {
      const handler = routes[pathname]
      if (!handler) return json(res, 404, { error: '接口不存在' })
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
    if (!res.headersSent) json(res, e.code || 500, { error: e.message || '服务器内部错误', attempts: e.attempts || undefined })
    else { try { res.end() } catch (err) {} }
  }
})

/* S1: 默认只监听本机；要开局域网请设 PHONOGRAPH_LAN=1 */
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

process.on('SIGINT', () => { server.close(); process.exit(0) })
module.exports = { server, db, sourceManager }
