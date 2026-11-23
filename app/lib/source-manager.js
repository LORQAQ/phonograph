'use strict'
/*
 * 自定义音源管理：加载 / 排序 / 回退取流
 * 目录：<root>/sources/*.js （LX Music 兼容脚本，UTF-8）
 */
const fs = require('node:fs')
const path = require('node:path')
const { LxScript, request } = require('./lx-engine.js')

const QUALITY_ORDER = ['flac24bit', 'flac', '320k', '192k', '128k']

/* 单个音源最多等 5 秒，防止某个源网络挂住拖垮整首 */
function callWithTimeout (fn, ms = 5000) {
  return Promise.race([
    Promise.resolve().then(fn),
    new Promise((_, rej) => setTimeout(() => rej(new Error('音源超时')), ms)),
  ])
}

/**
 * 播放地址探活：宁可放行，不误杀。
 * 只淘汰「明确 4xx/5xx」和「明确返回 HTML 错误页」的地址；
 * Content-Type 缺失、HEAD 不支持、403 防盗链（浏览器带 Referer 可播）一律放行。
 */
function probeUrl (url, timeout = 8000) {
  /* 网易云外链是 302 占位，播放必失败 */
  if (/music\.163\.com\/song\/media\/outer/i.test(String(url || ''))) return false
  /* WebView 的 <audio> 只稳支持 mp3/m4a/flac/ogg，
     裸 .aac/.wma/.ape 会报 MEDIA_ELEMENT_ERROR: Format error (code 4) */
  if (/\.(aac|wma|ape|cue)(\?|$)/i.test(String(url || ''))) return false

  return new Promise((resolve) => {
    let settled = false
    const done = (v) => { if (!settled) { settled = true; clearTimeout(timer); resolve(v) } }
    const timer = setTimeout(() => done(false), timeout)
    try {
      const u = new URL(url)
      const lib = u.protocol === 'https:' ? require('node:https') : require('node:http')
      /* 和播放器一样用普通 GET，只看前 64 字节，立刻断开 */
      const req = lib.get(u, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0', Accept: '*/*' },
        timeout: Math.max(3000, timeout - 1500),
      }, (res) => {
        if (res.statusCode >= 400 && res.statusCode !== 206) { res.resume(); return done(false) }
        let judged = false
        res.on('data', (chunk) => {
          if (judged) return
          judged = true
          const head = chunk.slice(0, 64).toString('latin1').trim()
          try { res.destroy() } catch (e) { }
          if (!head) return done(false)
          if (/^[{[]/.test(head)) return done(false)
          if (/^<(!doctype|html|\?xml)/i.test(head)) return done(false)
          done(true)
        })
        res.on('end', () => { if (!judged) done(false) })
        res.on('error', () => { if (!judged) done(false) })
      })
      req.on('error', () => done(false))
      req.on('timeout', () => { try { req.destroy() } catch (e) { } done(false) })
    } catch (e) { done(false) }
  })
}

// 默认优先级（文件名不含 .js）；未列出的排在后面
const DEFAULT_ORDER = [
  'fish', 'sixyin', 'nianxin', 'kulao', 'quandouyao', 'yiyin',
  'lxv7', 'lx', 'huibq', 'ikun', 'flower', 'grass', 'changqing', 'juhe',
]

class SourceManager {
  constructor (dir, config) {
    this.dir = dir
    this.config = config || {}
    this.entries = new Map()
    this.stats = new Map() // "源|平台" -> { ok, fail, avgMs, lastFail } // id -> { id, file, meta, script, status, sources, error, qualitys }
    this.loading = false
  }

  list () {
    return [...this.entries.values()].map((e) => ({
      id: e.id,
      name: e.meta.name,
      version: e.meta.version,
      author: e.meta.author,
      description: e.meta.description,
      file: e.file,
      status: e.status,
      error: e.error,
      enabled: e.enabled,
      sources: Object.keys(e.sources || {}),
      qualitys: e.qualitys || {},
      priority: this.priorityOf(e.id),
      logs: (e.script && e.script.logs || []).slice(-30),
    })).sort((a, b) => a.priority - b.priority)
  }

  priorityOf (id) {
    const order = (this.config.sourceOrder && this.config.sourceOrder.length) ? this.config.sourceOrder : DEFAULT_ORDER
    const i = order.indexOf(id)
    return i === -1 ? 999 : i
  }

  enabledOf (id) {
    if (!this.config.disabledSources) return true
    return !this.config.disabledSources.includes(id)
  }

  async loadAll () {
    /* B42: 进行中的加载共享给后来者（原来 `if (this.loading) return` 直接返回 undefined，
       调用方以为加载完了，界面显示 0 个音源）；
       同时队列里放文件名而不是已启动的 Promise，否则「最多 4 并发」形同虚设 */
    if (this._loadingPromise) return this._loadingPromise
    this._loadingPromise = (async () => {
      try {
        if (!fs.existsSync(this.dir)) fs.mkdirSync(this.dir, { recursive: true })
        const queue = fs.readdirSync(this.dir).filter((f) => /\.js$/i.test(f) && !f.startsWith('.'))
        const worker = async () => {
          while (queue.length) {
            const f = queue.shift()
            try { await this.loadOne(f) } catch (e) { /* 单个失败不影响其他 */ }
          }
        }
        await Promise.all([worker(), worker(), worker(), worker()])
      } finally {
        this._loadingPromise = null
      }
    })()
    return this._loadingPromise
  }

  async loadOne (file) {
    const id = file.replace(/\.js$/i, '')
    const full = path.join(this.dir, file)
    let code = ''
    try { code = fs.readFileSync(full, 'utf8') } catch (e) { return }
    const old = this.entries.get(id)
    if (old && old.script) old.script.dispose()
    const entry = {
      id, file, meta: { name: id }, script: null, status: 'loading', sources: {}, error: '',
      enabled: this.enabledOf(id), qualitys: {},
    }
    this.entries.set(id, entry)
    const script = new LxScript(code, file)
    entry.meta = script.meta
    entry.script = script
    try {
      const info = await script.init(12000)
      entry.sources = info.sources || {}
      entry.qualitys = Object.fromEntries(Object.entries(entry.sources).map(([k, v]) => [k, (v.qualitys || []).join('/')]))
      entry.status = 'ok'
    } catch (e) {
      entry.status = 'error'
      entry.error = e.message
    }
    return entry
  }

  async reload (id) {
    const e = this.entries.get(id)
    if (!e) throw new Error('音源不存在')
    await this.loadOne(e.file)
    return this.list().find((x) => x.id === id)
  }

  remove (id) {
    const e = this.entries.get(id)
    if (!e) throw new Error('音源不存在')
    try { fs.unlinkSync(path.join(this.dir, e.file)) } catch (err) {}
    if (e.script) e.script.dispose()
    this.entries.delete(id)
  }

  /* 安装脚本：源码文本 + 名称 */
  install (name, code) {
    const safe = String(name || 'custom').replace(/[^\w\u4e00-\u9fa5.-]/g, '_').slice(0, 40)
    const file = safe.endsWith('.js') ? safe : safe + '.js'
    fs.writeFileSync(path.join(this.dir, file), code, 'utf8')
    return file
  }

  /* 所有可用（脚本可用且启用）且支持该平台的源，按优先级 */
  /** 记录一次取流结果，用于后续排序 */
  recordResult (sourceId, platform, ok, ms) {
    const k = sourceId + '|' + platform
    let st = this.stats.get(k)
    if (!st) { st = { ok: 0, fail: 0, avgMs: 0, lastFail: 0 }; this.stats.set(k, st) }
    if (ok) {
      st.ok++
      st.avgMs = st.avgMs ? Math.round(st.avgMs * 0.7 + (ms || 0) * 0.3) : (ms || 0)
    } else {
      st.fail++
      st.lastFail = Date.now()
    }
  }

  /** 打分：成功率为主，速度加分，近期失败扣分 */
  scoreOf (sourceId, platform) {
    const st = this.stats.get(sourceId + '|' + platform)
    if (!st || (st.ok + st.fail) < 2) return 50
    const total = st.ok + st.fail
    const rate = st.ok / total
    const speed = st.avgMs > 0 ? Math.max(-15, 12 - st.avgMs / 800) : 0
    const recentFail = (st.lastFail && (Date.now() - st.lastFail < 600000)) ? -35 : 0
    return rate * 100 + speed + recentFail
  }

  candidates (platform) {
    const list = this.list()
      .filter((x) => x.status === 'ok' && x.enabled && x.sources.includes(platform))
      .sort((a, b) => a.priority - b.priority)
    /* 酷狗：念心/长青这类中转对 kg 基本失效（返回 404/503），把 verified 的源排前面 */
    const KG_ORDER = ['dujia6', 'kxh', 'xingkong', 'yuxi', 'changqing2', 'fish', 'freelisten']
    const initialBias = (id) => {
      const i = KG_ORDER.indexOf(id)
      return platform === 'kg' ? (i < 0 ? 9 : i) * -0.5 : 0
    }
    list.sort((a, b) => {
      const sa = this.scoreOf(a.id, platform) + initialBias(a.id)
      const sb = this.scoreOf(b.id, platform) + initialBias(b.id)
      return sb - sa
    })
    return list
  }

  bestQuality (platform, wanted) {
    const cands = this.candidates(platform)
    for (const c of cands) {
      const qs = (c.qualitys[platform] || '').split('/').filter(Boolean)
      if (!qs.length) continue
      if (wanted && qs.includes(wanted)) return wanted
      for (const q of QUALITY_ORDER) if (qs.includes(q)) return q
    }
    return wanted || '320k'
  }

  /* 依次尝试各源取播放地址；only 指定时只尝试该源 */
  async resolveUrl (platform, musicInfo, wantedQuality, only) {
    let cands = this.candidates(platform)
    if (only) cands = cands.filter((c) => c.id === only)
    if (!cands.length) throw new Error(only ? ('指定音源不可用：' + only) : ('没有可用的音源脚本支持 ' + platform))

    const attempts = []
    const QUALITY_ORDER = ['flac24bit', 'flac', '320k', '192k', '128k']

    /* 每个源只试"首选 + 降级一档"，并行发起，谁先成功用谁 */
    const task = (c) => async () => {
      const entry = this.entries.get(c.id)
      if (!entry || !entry.script) throw new Error('脚本未就绪')
      const qs = (entry.qualitys[platform] || '').split('/').filter(Boolean)
      const tries = []
      if (wantedQuality && qs.includes(wantedQuality)) tries.push(wantedQuality)
      for (const q of QUALITY_ORDER) if (qs.includes(q) && !tries.includes(q)) tries.push(q)
      if (!tries.length) tries.push(wantedQuality || '320k')
      for (const q of tries.slice(0, 2)) {
        const t0 = Date.now()
        try {
          const url = await callWithTimeout(() => entry.script.musicUrl(platform, musicInfo, q), 5000)
          const ms = Date.now() - t0
          if (typeof url === 'string' && /^https?:\/\//.test(url)) {
            /* 拿到的地址先验一次，404 之类直接换源，别把坏地址交给播放器 */
            const alive = await probeUrl(url, 6000)
            if (alive) {
              this.recordResult(c.id, platform, true, ms)
              attempts.push({ id: c.id, name: entry.meta.name, quality: q, ok: true, ms })
              return { url, quality: q, provider: entry.meta.name, sourceId: c.id, attempts }
            }
            this.recordResult(c.id, platform, false, ms)
            attempts.push({ id: c.id, name: entry.meta.name, quality: q, ok: false, ms, error: '地址不可用' })
          } else {
            attempts.push({ id: c.id, name: entry.meta.name, quality: q, ok: false, ms, error: '返回空地址' })
          }
        } catch (e) {
          this.recordResult(c.id, platform, false, Date.now() - t0)
          attempts.push({ id: c.id, name: entry.meta.name, quality: q, ok: false, ms: Date.now() - t0, error: (e && e.message) || '错误' })
        }
      }
      throw new Error('no url')
    }

    /* 目标音质在降级链里的排名（数字越小音质越高）*/
    const wantIdx = QUALITY_ORDER.indexOf(wantedQuality || '320k')

    const winner = await new Promise((resolve) => {
      let settled = false
      let pending = cands.length
      /* 已经成功、但音质低于目标的源。先留着当兜底，
         不能一拿到就返回 —— Free listen 只支持 128k 却响应最快，
         原来它永远抢先，导致用户选 320k/无损也一直是 128k。 */
      let fallback = null
      let timer = null
      const finish = (v) => {
        if (settled) return
        settled = true
        if (timer) clearTimeout(timer)
        resolve(v)
      }
      const oneDone = () => {
        if (settled) return
        if (--pending === 0) finish(fallback)
      }
      timer = setTimeout(() => finish(fallback), 24000)   /* B17: tries 最多 2 档，每档 5000(call)+6000(probe)=11000，
                                     两档最坏 22000。原来 12000 盖不住，会把「第一档超时、第二档能成」的慢源判死 */
      cands.forEach((c) => {
        task(c)().then((v) => {
          if (settled) return
          const gotIdx = QUALITY_ORDER.indexOf(v.quality)
          /* 达到或超过目标音质 → 立刻采用 */
          if (wantIdx < 0 || gotIdx < 0 || gotIdx <= wantIdx) return finish(v)
          /* 低于目标：先当备用，继续等更好的源。
             备用也要取音质最高的那个 —— 否则请求 flac24bit 没有源能给时，
             会退回最先到的 128k，而不是已经拿到的 flac。 */
          if (!fallback || gotIdx < QUALITY_ORDER.indexOf(fallback.quality)) fallback = v
          oneDone()
        }).catch(() => oneDone())
      })
    })

    if (winner) return winner
    const last = attempts.filter((a) => !a.ok).slice(-1)[0]
    throw new Error('所有音源均失败' + (last ? '（最后错误：' + last.name + ': ' + last.error + '）' : ''))
  }

  async testAll (platform, musicInfo, quality = '320k') {
    const cands = this.candidates(platform)
    const results = []
    await Promise.all(cands.map(async (c) => {
      const entry = this.entries.get(c.id)
      const t0 = Date.now()
      try {
        /* P1: 这里原来没有超时。脚本的 musicUrl 只要不 settle
           （网络挂住 / await 一个永不返回的 Promise / TCP 半开），
           整个 /api/sources/test 就永久挂起，前端按钮一直转圈。
           resolveUrl 那条路径有 5 秒超时，这里保持一致。 */
        const url = await callWithTimeout(() => entry.script.musicUrl(platform, musicInfo, quality), 5000)
        const ok = typeof url === 'string' && /^https?:\/\//.test(url)
        results.push({ id: c.id, name: entry.meta.name, ok, ms: Date.now() - t0, url: ok ? url : '', error: ok ? '' : '返回空地址' })
      } catch (e) {
        results.push({ id: c.id, name: entry.meta.name, ok: false, ms: Date.now() - t0, url: '', error: e.message })
      }
    }))
    return results.sort((a, b) => (b.ok - a.ok) || (a.ms - b.ms))
  }
}

module.exports = { SourceManager, QUALITY_ORDER }
