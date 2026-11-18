/* 留声 · 浏览器版 LX 音源脚本运行时
 * 与 app/lib/lx-engine.js 接口一致：lx.on('request') / lx.send('inited') / lx.request / lx.utils
 * 依赖：crypto-js（AES/MD5）、jsencrypt（RSA）、pako（zlib）、NAPI（原生 HTTP）
 */
(function () {
  'use strict'

  /* ---------------- Buffer 精简实现 ---------------- */
  function B64 (bin) { return btoa(bin) }
  function fromB64 (s) { return atob(s) }

  class Buf extends Uint8Array {
    static from (data, enc) {
      if (data instanceof Buf) return new Buf(data)
      if (data instanceof Uint8Array) return new Buf(data)
      if (data instanceof ArrayBuffer) return new Buf(new Uint8Array(data))
      if (Array.isArray(data)) return new Buf(Uint8Array.from(data))
      if (typeof data === 'string') {
        enc = (enc || 'utf8').toLowerCase()
        if (enc === 'hex') {
          const out = new Buf(data.length / 2)
          for (let i = 0; i < out.length; i++) out[i] = parseInt(data.substr(i * 2, 2), 16)
          return out
        }
        if (enc === 'base64') {
          const bin = fromB64(data)
          const out = new Buf(bin.length)
          for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
          return out
        }
        if (enc === 'binary' || enc === 'latin1') {
          const out = new Buf(data.length)
          for (let i = 0; i < data.length; i++) out[i] = data.charCodeAt(i) & 0xff
          return out
        }
        const bytes = new TextEncoder().encode(data)
        return new Buf(bytes)
      }
      return new Buf(0)
    }
    static alloc (n) { return new Buf(n) }
    static concat (list) {
      const total = list.reduce((a, b) => a + b.length, 0)
      const out = new Buf(total)
      let off = 0
      for (const b of list) { out.set(b, off); off += b.length }
      return out
    }
    static isBuffer (x) { return x instanceof Buf }
    toString (enc) {
      enc = (enc || 'utf8').toLowerCase()
      if (enc === 'hex') {
        let s = ''
        for (let i = 0; i < this.length; i++) s += this[i].toString(16).padStart(2, '0')
        return s
      }
      if (enc === 'base64') {
        const chunk = 0x8000
        let bin = ''
        for (let i = 0; i < this.length; i += chunk) {
          bin += String.fromCharCode.apply(null, this.subarray(i, i + chunk))
        }
        return B64(bin)
      }
      if (enc === 'binary' || enc === 'latin1') {
        let s = ''
        for (let i = 0; i < this.length; i++) s += String.fromCharCode(this[i])
        return s
      }
      return new TextDecoder('utf-8').decode(this)
    }
    slice (a, b) { return new Buf(this.subarray(a, b)) }
  }

  function toBuf (x) {
    if (x instanceof Buf) return x
    if (x instanceof Uint8Array) return new Buf(x)
    if (x instanceof ArrayBuffer) return new Buf(new Uint8Array(x))
    if (typeof x === 'string') return Buf.from(x)
    return Buf.from(String(x))
  }

  /* ---------------- HTTP（走原生桥） ---------------- */
  function nativeHttp (url, opts) {
    if (window.NativeHttp) return window.NativeHttp.request(url, opts)
    return Promise.reject(new Error('原生桥不可用'))
  }

  function request (url, options, callback) {
    options = options || {}
    callback = callback || function () {}
    let canceled = false
    let payload = ''
    const headers = Object.assign({}, options.headers || {})
    if (options.form) {
      payload = new URLSearchParams(options.form).toString()
      if (!headers['Content-Type']) headers['Content-Type'] = 'application/x-www-form-urlencoded'
    } else if (options.body !== undefined && options.body !== null) {
      payload = typeof options.body === 'string' ? options.body : JSON.stringify(options.body)
      if (!headers['Content-Type']) headers['Content-Type'] = 'application/json'
    }
    const method = String(options.method || (payload ? 'POST' : 'GET')).toUpperCase()
    nativeHttp(url, { method, headers, body: payload, insecure: options.insecure })
      .then((resp) => {
        if (canceled) return
        const body = resp.body
        try { callback(null, { statusCode: resp.statusCode, body, headers: resp.headers }, body) } catch (e) {}
      })
      .catch((err) => { if (!canceled) callback(err) })
    return function cancel () { canceled = true }
  }

  /* ---------------- utils ---------------- */
  const C = window.CryptoJS
  const P = window.pako

  function aesEncrypt (buffer, mode, key, iv) {
    const m = String(mode).toLowerCase().match(/^aes-(\d+)-(\w+)$/)
    if (!m) throw new Error('不支持的 AES 模式: ' + mode)
    const keyLen = parseInt(m[1], 10) / 8
    const modeName = m[2]
    const keyBytes = toBuf(key).slice(0, keyLen)
    const keyWA = C.lib.WordArray.create(new Uint8Array(keyBytes))
    const cfg = { mode: C.mode[modeName.toUpperCase()] || C.mode.CBC, padding: C.pad.Pkcs7 }
    if (iv && modeName !== 'ecb') cfg.iv = C.lib.WordArray.create(new Uint8Array(toBuf(iv)))
    const dataWA = C.lib.WordArray.create(new Uint8Array(toBuf(buffer)))
    const enc = C.AES.encrypt(dataWA, keyWA, cfg)
    const out = Buf.from(enc.ciphertext.toString(C.enc.Base64), 'base64')
    return out
  }

  function rsaEncrypt (buffer, key) {
    const js = new window.JSEncrypt()
    js.setPublicKey(key)
    const bytes = toBuf(buffer)
    let bin = ''
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
    const b64 = js.encrypt(bin)
    if (!b64) throw new Error('RSA 加密失败')
    return Buf.from(b64, 'base64')
  }

  function md5 (str) { return C.MD5(String(str)).toString() }

  function randomBytes (size) {
    const n = Number(size) || 0
    const arr = new Uint8Array(n)
    ;(window.crypto || window.msCrypto).getRandomValues(arr)
    return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('')
  }

  function createUtils () {
    return {
      buffer: {
        from: (data, enc) => Buf.from(data, enc),
        bufToString: (buf, format) => Buf.from(toBuf(buf)).toString(format || 'utf8'),
      },
      crypto: { aesEncrypt, rsaEncrypt, md5, randomBytes },
      zlib: {
        inflate: (buf) => new Promise((resolve, reject) => {
          try { resolve(Buf.from(P.inflate(new Uint8Array(toBuf(buf))))) } catch (e) { reject(e) }
        }),
        deflate: (buf) => new Promise((resolve, reject) => {
          try { resolve(Buf.from(P.deflate(new Uint8Array(toBuf(buf))))) } catch (e) { reject(e) }
        }),
      },
    }
  }

  /* ---------------- 脚本实例 ---------------- */
  const EVENT_NAMES = { inited: 'inited', request: 'request', updateAlert: 'updateAlert' }

  function parseMeta (code) {
    const meta = { name: '未命名音源', description: '', version: '', author: '', homepage: '' }
    const head = code.slice(0, 4000)
    const pick = (k) => {
      const m = head.match(new RegExp('@' + k + '\\s+([^\\r\\n*]+)'))
      return m ? m[1].trim() : ''
    }
    for (const k of ['name', 'description', 'version', 'author', 'homepage']) {
      const v = pick(k)
      if (v) meta[k] = v
    }
    return meta
  }

  class LxScript {
    constructor (id, code) {
    this.logs = []   /* B24: 音源日志 */
      this.id = id
      this.code = code
      this.meta = parseMeta(code)
      this.handlers = {}
      this.sources = {}
      this.inited = false
      this.error = null
      this.alert = null
    }

    init (timeout) {
      const self = this
      timeout = timeout || 20000
      return new Promise((resolve, reject) => {
        let settled = false
        const timer = setTimeout(() => {
          if (settled) return
          settled = true
          reject(new Error('脚本初始化超时'))
        }, timeout)

        const lx = {
          version: '2.0.0',
          env: 'mobile',
          currentScriptInfo: Object.assign({}, this.meta, { rawScript: this.code }),
          EVENT_NAMES,
          on (ev, fn) { self.handlers[ev] = fn },
          send (ev, data) {
            if (ev === EVENT_NAMES.inited) {
              if (settled) return
              settled = true
              clearTimeout(timer)
              if (!data || !data.sources) { reject(new Error('inited 缺少 sources')); return }
              self.sources = data.sources
              self.inited = true
              resolve(data)
            } else if (ev === EVENT_NAMES.updateAlert) {
              self.alert = data
            }
          },
          request,
          utils: createUtils(),
        }

        const prevLx = globalThis.lx
        globalThis.lx = lx
        globalThis.Buffer = Buf
        globalThis.atob = atob
        globalThis.btoa = btoa
        try {
          // eslint-disable-next-line no-new-func
          const fn = new Function(this.code + '\n//# sourceURL=lx-source-' + this.id + '.js')
          fn.call(globalThis)
        } catch (e) {
          settled = true
          clearTimeout(timer)
          this.error = '脚本执行异常: ' + e.message
          reject(new Error(this.error))
        }
        // 脚本同步初始化失败时恢复
        setTimeout(() => { if (settled && globalThis.lx === lx) globalThis.lx = prevLx }, 100)
      })
    }

    call (source, action, info, timeout) {
      if (!this.inited) return Promise.reject(new Error('音源未初始化'))
      const handler = this.handlers[EVENT_NAMES.request]
      if (typeof handler !== 'function') return Promise.reject(new Error('脚本未注册 request'))
      const ret = handler({ source, action, info })
      if (!ret || typeof ret.then !== 'function') return Promise.reject(new Error('request 必须返回 Promise'))
      return Promise.race([
        Promise.resolve(ret),
        new Promise((_, rej) => setTimeout(() => rej(new Error('获取播放地址超时')), timeout || 25000)),
      ])
    }

    musicUrl (source, info, quality) {
      return this.call(source, 'musicUrl', { type: quality, musicInfo: info })
    }
  }

  /* ---------------- 管理器 ---------------- */
  const ScriptManager = {
    scripts: new Map(),
    codes: new Map(),
    disabled: new Set(),
    ready: false,
    loading: null,

    async loadAll (list) {
      if (this.loading) return this.loading
      this.loading = (async () => {
        const items = (list || []).slice()
        /* 小脚本先来，大的后置 */
        items.sort((a, b) => (a.code ? a.code.length : 0) - (b.code ? b.code.length : 0))

        const loadOne = async (item) => {
          let s2 = null
          try {
            s2 = new LxScript(item.id, item.code)
          } catch (e) {
            console.warn('[音源] 构造失败', item.id, e && e.message)
            return
          }
          /* 硬超时：init 永不回调也不会卡住整批 */
          const t0 = Date.now()
          let ok = false
          try {
            ok = await Promise.race([
              Promise.resolve(s2.init(6000)).then(() => true),
              new Promise((r) => setTimeout(() => r(false), 7000)),
            ])
          } catch (e) {
            console.warn('[音源] init 异常', item.id, e && e.message)
          }
          if (!ok) {
            console.warn('[音源] 超时跳过', item.id)
            return
          }
          try {
            s2.delay = Date.now() - t0
            this.scripts.set(item.id, s2)
            this.codes.set(item.id, item.code)
            console.log('[音源] 已加载', item.id, '→', Object.keys(s2.sources || {}).join(','), s2.delay + 'ms')
          } catch (e) { }
        }

        /* fish 单独最后加载（625KB 混淆代码，解析期间会让出主线程） */
        const heavy = items.filter((x) => x.id === 'fish')
        const light = items.filter((x) => x.id !== 'fish')
        for (const item of light) {
          await loadOne(item)
        }
        for (const item of heavy) {
          await new Promise((r) => setTimeout(r, 300))
          await loadOne(item)
        }

        this.ready = true
        console.log('[音源] 加载完成，可用', this.scripts.size, '个 / 共', items.length, '个')
        return this.scripts.size
      })()
      /* B8: 完成后释放锁，否则 reload 永远拿到旧 Promise */
      this.loading.then(() => { this.loading = null }).catch(() => { this.loading = null })
      return this.loading
    },

    /** 依次尝试脚本取流，优先返回 https 官方 CDN 地址 */
    async resolve (platform, info, quality, only) {
      const withTimeout = (promise, ms) => Promise.race([
        promise,
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
      ])

      if (!this.scripts.size) return null

      /* 验证 URL 真的能下（HEAD 或读前 256 字节） */
      /* 只排除明显无效的 URL；probe 失败不阻塞（很多 CDN 拒绝 HEAD 但仍可播） */
      const probeUrl = async (url) => {
        if (!url || typeof url !== 'string') return false
        if (url.length < 10) return false
        if (/^(null|undefined|none)$/i.test(url)) return false
        if (/^data:|^blob:/.test(url)) return true
        if (!/^https?:/i.test(url)) return false
        /* 网易云外链只是 302 占位，播放必然 Format error，直接判无效 */
        if (/music\.163\.com\/song\/media\/outer\/url/i.test(url)) {
          console.warn('[取流] 收到外链占位，跳过', url.slice(0, 50))
          return false
        }
        /* WebView 的 <audio> 只稳支持 mp3/m4a/flac/ogg，
           裸 .aac/.wma/.ape 会报 MEDIA_ELEMENT_ERROR: Format error (code 4) */
        if (/\.(aac|wma|ape|cue)(\?|$)/i.test(url)) {
          console.warn('[取流] 格式不支持，跳过', url.slice(-40))
          return false
        }
        /* 不再做网络探测：HEAD 常被 CDN 拒，会误杀可用地址 */
        return true
      }

      const PRIO = ['fish', 'kxh', 'dujia6', 'yuxi', 'changqing2', 'freelisten']
      const PRIO_KG = ['fish', 'kxh', 'dujia6', 'yuxi', 'changqing2', 'freelisten']
      const order = platform === 'kg' ? PRIO_KG : PRIO
      const want = only ? [only].concat(order.filter((x) => x !== only)) : order

      /* B9: 过滤被禁用的音源 */
      const isDisabled = (id) => this.disabled && this.disabled.has && this.disabled.has(id)
      const list = want.filter((id) => !isDisabled(id)).map((id) => this.scripts.get(id)).filter(Boolean)
      if (!list.length) {
        /* 平台不在优先列表里，全部试一遍 */
        for (const s2 of this.scripts.values()) list.push(s2)
      }

      /* ① 先单独试 fish：实测只有它给完整版，其他音源返回 30 秒试听
           strict match 偶发不中，重试 3 次（带不同音质档） */
      const fishScript = this.scripts.get('fish')
      if (fishScript) {
        const qs = quality === 'flac' ? ['flac', '320k', '128k'] : ['320k', '128k', 'flac']
        for (let attempt = 0; attempt < 3; attempt++) {
          const q2 = qs[attempt] || quality
          try {
            const fr = await withTimeout(Promise.resolve(fishScript.musicUrl(platform, info, q2)), 9000)
            const fu = typeof fr === 'string' ? fr : (fr && (fr.url || (fr.data && fr.data.url)))
            if (fu && await probeUrl(fu)) {
              return { url: fu, provider: 'fish_music', quality: q2 }
            }
          } catch (e) {
            console.warn('[取流] fish 第' + (attempt + 1) + '次失败', e && e.message)
            await new Promise((r) => setTimeout(r, 300))
          }
        }
      }

      /* ② fish 不行，再并发试其他的 */

      /* 并行竞速：谁先给出可用 URL 就用谁 */
      const tasks = list.map(async (s2) => {
        try {
          const r = await withTimeout(Promise.resolve(s2.musicUrl(platform, info, quality)), 5000)
          /* 兼容：字符串 URL 或 { url: '...' } 或 { data: { url } } */
          let u = ''
          let extra = {}
          if (typeof r === 'string') {
            u = r
          } else if (r && typeof r === 'object') {
            u = r.url || (r.data && r.data.url) || ''
            extra = r
          }
          if (!u) return null
          const ok = await probeUrl(u)
          if (!ok) {
            console.warn('[取流] URL 无效，跳过', s2.id, String(u).slice(0, 50))
            return null
          }
          return Object.assign({}, extra, { url: u, provider: extra.provider || s2.id })
        } catch (e) {
          return null
        }
      })

      /* 谁先返回可用结果就赢 */
      const winner = await new Promise((resolve) => {
        let pending = tasks.length
        let done = false
        if (!pending) return resolve(null)
        tasks.forEach((t) => {
          t.then((r) => {
            pending--
            if (r && !done) { done = true; resolve(r) }
            else if (!pending && !done) { done = true; resolve(null) }
          }).catch(() => {
            pending--
            if (!pending && !done) { done = true; resolve(null) }
          })
        })
        /* 总超时 20 秒 */
        setTimeout(() => { if (!done) { done = true; resolve(null) } }, 8000)
      })

      return winner
    },

    async reload (id) {
      if (id) {
        const code = this.codes.get(id)
        if (!code) return null
        const s = new LxScript(id, code)
        try {
          const t0 = Date.now()
          await s.init(15000)
          s.delay = Date.now() - t0
          this.scripts.set(id, s)
        } catch (e) { s.error = e.message; this.scripts.set(id, s) }
      } else {
        await this.loadAll(Array.from(this.codes.entries()).map(([id, code]) => ({ id, code })))
      }
      return this.list()
    },

    remove (id) {
      this.scripts.delete(id)
      this.codes.delete(id)
      this.disabled.delete(id)
      return this.list()
    },

    toggle (id, enabled) {
      if (enabled) this.disabled.delete(id)
      else this.disabled.add(id)
      return this.list()
    },

    async addCode (id, code, name) {
      const s = new LxScript(id, code)
      const t0 = Date.now()
      await s.init(15000)
      s.delay = Date.now() - t0
      if (name) s.meta.name = name
      this.scripts.set(id, s)
      this.codes.set(id, code)
      return this.list()
    },

    /** 并发测速：重新初始化每个脚本，返回耗时 */
    async testAll (platform) {
      const out = []
      for (const [id, s] of this.scripts) {
        if (platform && s.sources && !s.sources[platform]) continue
        const t0 = Date.now()
        try {
          const fresh = new LxScript(id, this.codes.get(id) || '')
          await fresh.init(15000)
          out.push({ id, name: s.meta.name || id, ok: true, delay: Date.now() - t0, sources: Object.keys(fresh.sources || {}) })
        } catch (e) {
          out.push({ id, name: s.meta.name || id, ok: false, error: e.message, delay: Date.now() - t0 })
        }
      }
      out.sort((a, b) => (a.ok === b.ok ? a.delay - b.delay : a.ok ? -1 : 1))
      return out
    },

    list () {
      return Array.from(this.scripts.entries()).map(([id, s]) => ({
        id,
        name: s.meta.name || id,
        author: s.meta.author || '',
        version: s.meta.version || '1.0.0',
        description: s.meta.description || '',
        homepage: s.meta.homepage || '',
        status: s.error ? 'error' : 'ok',
        enabled: !this.disabled.has(id),
        error: s.error || null,
        delay: s.delay || 0,
        sources: Object.keys(s.sources || {}),
        logs: (s.logs || []).slice(-20),
      }))
    },
  }

  window.Buf = Buf
  window.LxScript = LxScript
  window.LxScriptManager = ScriptManager
})()
