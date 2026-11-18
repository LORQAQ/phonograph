'use strict'
/*
 * LX 兼容自定义源脚本运行时
 * ---------------------------------------------------------------
 * 用于在 Node 进程里加载洛雪音乐（LX Music）格式的音源脚本：
 *   脚本读取 globalThis.lx，注册 lx.on('request', fn)，并发 send('inited', {sources})
 * 本运行时提供 lx.request / lx.utils / console / Buffer / fetch 等宿主能力，
 * 与桌面版 lx-music 的 worker 环境保持接口一致。
 */
const vm = require('node:vm')
const http = require('node:http')
const https = require('node:https')
const zlib = require('node:zlib')
const crypto = require('node:crypto')

const EVENT_NAMES = {
  inited: 'inited',
  request: 'request',
  updateAlert: 'updateAlert',
}

/* ------------------------------------------------------------------ */
/* 脚本头部元信息解析                                                   */
/* ------------------------------------------------------------------ */
function parseMeta (code) {
  const meta = { name: '未命名音源', description: '', version: '', author: '', homepage: '' }
  const head = code.slice(0, 4000)
  const pick = (key) => {
    const m = head.match(new RegExp('@' + key + '\\s+([^\\r\\n*]+)'))
    return m ? m[1].trim() : ''
  }
  for (const k of ['name', 'description', 'version', 'author', 'homepage']) {
    const v = pick(k)
    if (v) meta[k] = v
  }
  return meta
}

/* ------------------------------------------------------------------ */
/* HTTP 请求（不受跨域限制，等价 lx.request）                            */
/* ------------------------------------------------------------------ */
function buildMultipart (formData) {
  const boundary = '----LxFormBoundary' + crypto.randomBytes(8).toString('hex')
  const parts = []
  for (const [name, raw] of Object.entries(formData)) {
    const val = raw && typeof raw === 'object' && !Buffer.isBuffer(raw) ? raw : { value: raw }
    const filename = val.filename
    let body
    if (Buffer.isBuffer(val.value)) body = val.value
    else body = Buffer.from(String(val.value ?? ''), 'utf8')
    let head = `--${boundary}\r\nContent-Disposition: form-data; name="${name}"`
    if (filename) head += `; filename="${filename}"`
    head += '\r\n'
    if (val.contentType) head += `Content-Type: ${val.contentType}\r\n`
    head += '\r\n'
    parts.push(Buffer.from(head, 'utf8'), body, Buffer.from('\r\n'))
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'))
  return { buffer: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` }
}

function request (url, options = {}, callback = () => {}) {
  let canceled = false
  let req = null
  const finish = (err, resp) => {
    if (canceled) return
    try { callback(err, resp, resp && resp.body) } catch (e) { /* 用户回调异常不冒泡 */ }
  }
  let parsed
  try {
    parsed = new URL(url)
  } catch (e) {
    setImmediate(() => finish(e))
    return () => { canceled = true }
  }

  const headers = Object.assign({}, options.headers || {})
  let payload = null
  if (options.form) {
    payload = Buffer.from(new URLSearchParams(options.form).toString(), 'utf8')
    if (!headers['Content-Type'] && !headers['content-type']) headers['Content-Type'] = 'application/x-www-form-urlencoded'
  } else if (options.formData) {
    const mp = buildMultipart(options.formData)
    payload = mp.buffer
    headers['Content-Type'] = mp.contentType
  } else if (options.body !== undefined && options.body !== null) {
    payload = Buffer.isBuffer(options.body) ? options.body : Buffer.from(typeof options.body === 'string' ? options.body : JSON.stringify(options.body), 'utf8')
    if (!headers['Content-Type'] && !headers['content-type']) headers['Content-Type'] = 'application/json'
  }
  const method = String(options.method || (payload ? 'POST' : 'GET')).toUpperCase()
  if (payload && !headers['Content-Length'] && !headers['content-length']) headers['Content-Length'] = payload.length
  if (!headers['User-Agent'] && !headers['user-agent']) {
    headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
  }

  const lib = parsed.protocol === 'https:' ? https : http
  const timeout = Math.max(3000, Number(options.timeout) || 20000)
  const reqOptions = { method, headers }
  if (options.insecure) reqOptions.rejectUnauthorized = false
  if (options.agent) reqOptions.agent = options.agent

  try {
    req = lib.request(parsed, reqOptions, (res) => {
      /* 跟随 3xx 重定向（最多 5 跳） */
      const loc = res.headers.location
      if (res.statusCode >= 300 && res.statusCode < 400 && loc && (options._redirects || 0) < 5) {
        res.resume()
        const next = new URL(loc, parsed).toString()
        const nextOpts = Object.assign({}, options, { _redirects: (options._redirects || 0) + 1 })
        if (res.statusCode === 303 || ((res.statusCode === 301 || res.statusCode === 302) && method === 'POST')) {
          nextOpts.method = 'GET'
          nextOpts.body = undefined
        }
        request(next, nextOpts, callback)
        return
      }
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        let buf = Buffer.concat(chunks)
        const enc = String(res.headers['content-encoding'] || '').toLowerCase()
        try {
          if (enc.includes('gzip')) buf = zlib.gunzipSync(buf)
          else if (enc.includes('deflate')) buf = zlib.inflateSync(buf)
          else if (enc.includes('br')) buf = zlib.brotliDecompressSync(buf)
        } catch (e) { /* 忽略解压失败 */ }
        const text = buf.toString('utf8')
        let body = text
        const ct = String(res.headers['content-type'] || '').toLowerCase()
        if (ct.includes('json') || /^\s*[[{]/.test(text)) {
          try { body = JSON.parse(text) } catch (e) { body = text }
        }
        finish(null, { statusCode: res.statusCode, statusMessage: res.statusMessage, headers: res.headers, body, raw: buf })
      })
    })
    req.setTimeout(timeout, () => { req.destroy(new Error('ETIMEDOUT')) })
    req.on('error', (e) => finish(e))
    if (payload) req.write(payload)
    req.end()
  } catch (e) {
    setImmediate(() => finish(e))
  }
  return () => { canceled = true; try { req && req.destroy() } catch (e) {} }
}

/* ------------------------------------------------------------------ */
/* lx.utils                                                            */
/* ------------------------------------------------------------------ */
function createUtils () {
  return {
    buffer: {
      from: (data, enc) => Buffer.from(data, enc),
      bufToString: (buf, format) => Buffer.from(buf).toString(format || 'utf8'),
    },
    crypto: {
      aesEncrypt (buffer, mode, key, iv) {
        const cipher = crypto.createCipheriv(mode, key, iv)
        return Buffer.concat([cipher.update(Buffer.from(buffer)), cipher.final()])
      },
      rsaEncrypt (buffer, key) {
        return crypto.publicEncrypt({ key, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(buffer))
      },
      md5: (str) => crypto.createHash('md5').update(str).digest('hex'),
      randomBytes: (size) => crypto.randomBytes(size).toString('hex'),
    },
    zlib: {
      inflate: (buf) => new Promise((resolve, reject) => zlib.inflate(Buffer.from(buf), (e, r) => e ? reject(e) : resolve(r))),
      deflate: (buf) => new Promise((resolve, reject) => zlib.deflate(Buffer.from(buf), (e, r) => e ? reject(e) : resolve(r))),
    },
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ------------------------------------------------------------------ */
/* 单个脚本实例                                                         */
/* ------------------------------------------------------------------ */
class LxScript {
  constructor (code, file = 'inline.js') {
    this.code = code
    this.file = file
    this.meta = parseMeta(code)
    this.sources = {}          // { wy: {name,type,actions,qualitys} }
    this.inited = false
    this.error = null
    this.logs = []
    this.handlers = {}
    this.timers = new Set()
    this.alert = null
  }

  log (level, args) {
    const line = args.map((a) => {
      if (typeof a === 'string') return a
      try { return JSON.stringify(a) } catch (e) { return String(a) }
    }).join(' ')
    this.logs.push({ level, line, ts: Date.now() })
    if (this.logs.length > 300) this.logs.shift()
  }

  async init (timeout = 25000) {
    const self = this
    const sandbox = {}
    const ctx = vm.createContext(sandbox)

    const lx = {
      version: '2.0.0',
      env: 'desktop',
      currentScriptInfo: Object.assign({}, this.meta, { rawScript: this.code }),
      EVENT_NAMES,
      on (event, handler) { self.handlers[event] = handler },
      send (event, data) {
        if (event === EVENT_NAMES.inited) { self._onInited(data) } else if (event === EVENT_NAMES.updateAlert) { self.alert = data }
      },
      request,
      utils: createUtils(),
    }

    const wrapTimer = (fn) => (...args) => {
      const t = fn(...args)
      self.timers.add(t)
      return t
    }
    const clearTimer = (t) => { self.timers.delete(t); clearTimeout(t) }

    Object.assign(sandbox, {
      lx,
      console: {
        log: (...a) => self.log('log', a),
        info: (...a) => self.log('info', a),
        warn: (...a) => self.log('warn', a),
        error: (...a) => self.log('error', a),
        debug: (...a) => self.log('debug', a),
        trace: (...a) => self.log('trace', a),
        dir: (...a) => self.log('dir', a),
        table: (...a) => self.log('table', a),
        group: (...a) => self.log('group', a),
        groupCollapsed: (...a) => self.log('group', a),
        groupEnd: () => {},
        count: () => {},
        countReset: () => {},
        time: () => {},
        timeEnd: () => {},
        assert: () => {},
        clear: () => {},
      },
      setTimeout: wrapTimer(setTimeout),
      clearTimeout: clearTimer,
      setInterval: wrapTimer(setInterval),
      clearInterval: clearTimer,
      queueMicrotask,
      fetch: globalThis.fetch,
      Request: globalThis.Request,
      Response: globalThis.Response,
      Headers: globalThis.Headers,
      AbortController: globalThis.AbortController,
      Buffer,
      URL,
      URLSearchParams,
      TextEncoder,
      TextDecoder,
      atob: (s) => Buffer.from(s, 'base64').toString('binary'),
      btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
      performance,
      crypto: globalThis.crypto,
    })
    sandbox.globalThis = sandbox
    this.ctx = ctx

    this._initedPromise = new Promise((resolve, reject) => {
      this._resolveInited = resolve
      this._rejectInited = reject
    })

    try {
      vm.runInContext(this.code, ctx, { filename: this.file, timeout: 20000 })
    } catch (e) {
      this.error = '脚本执行异常: ' + e.message
      throw new Error(this.error)
    }

    const result = await Promise.race([
      this._initedPromise,
      sleep(timeout).then(() => { throw new Error('脚本初始化超时（未发送 inited 事件）') }),
    ])
    this.inited = true
    return result
  }

  _onInited (data) {
    if (!data || typeof data !== 'object' || !data.sources) {
      this._rejectInited(new Error('inited 事件缺少 sources'))
      return
    }
    this.sources = data.sources
    this.alert = this.alert || null
    this._resolveInited({ sources: data.sources, openDevTools: data.openDevTools })
  }

  async call (source, action, info, timeout = 30000) {
    if (!this.inited) throw new Error('音源未初始化')
    const handler = this.handlers[EVENT_NAMES.request]
    if (typeof handler !== 'function') throw new Error('脚本未注册 request 事件')
    const ret = handler({ source, action, info })
    if (!ret || typeof ret.then !== 'function') throw new Error('request 回调必须返回 Promise')
    return await Promise.race([
      Promise.resolve(ret),
      sleep(timeout).then(() => { throw new Error('获取播放地址超时') }),
    ])
  }

  async musicUrl (source, info, quality) {
    return await this.call(source, 'musicUrl', { type: quality, musicInfo: info })
  }

  dispose () {
    for (const t of this.timers) { try { clearTimeout(t); clearInterval(t) } catch (e) {} }
    this.timers.clear()
  }
}

module.exports = { LxScript, parseMeta, request, EVENT_NAMES }
