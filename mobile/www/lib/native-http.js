/* 留声 · 手机端原生 HTTP 桥（异步，不阻塞 JS 线程）
 * 用法：window.NativeHttp.request(url, opts) -> Promise<{status, body}>
 * 由 <script> 在 api-mobile.js 与 lx-engine-web.js 之前加载
 */
(function () {
  'use strict'

  let seq = 0
  const pending = new Map()

  /* 原生通过 evaluateJavascript 回调这里 */
  window.__onHttp = function (id, res) {
    const cb = pending.get(String(id))
    if (!cb) return
    pending.delete(String(id))
    cb(res)
  }

  function request (url, opts) {
    opts = opts || {}
    return new Promise((resolve, reject) => {
      const bridge = window.NAPI
      if (!bridge) { reject(new Error('原生桥不可用')); return }
      const id = String(++seq)
      const timeout = setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id)
          reject(new Error('请求超时'))
        }
      }, 25000)

      pending.set(id, (res) => {
        clearTimeout(timeout)
        let r = res
        if (typeof r === 'string') {
          try { r = JSON.parse(r) } catch (e) { r = { error: '返回解析失败' } }
        }
        if (!r) { reject(new Error('无响应')); return }
        if (r.error) { reject(new Error(r.error)); return }
        resolve({ status: r.status || 200, body: r.body || '' })
      })

      const payload = JSON.stringify({
        method: opts.method || 'GET',
        headers: opts.headers || {},
        body: typeof opts.body === 'string' ? opts.body : (opts.body ? JSON.stringify(opts.body) : ''),
        insecure: !!opts.insecure,
      })

      try {
        if (bridge.httpAsync) bridge.httpAsync(id, url, payload)
        else {
          /* 兜底：同步桥 */
          const out = bridge.http(url, payload)
          window.__onHttp(id, out)
        }
      } catch (e) {
        pending.delete(id)
        clearTimeout(timeout)
        reject(e)
      }
    })
  }

  window.NativeHttp = {
    request,
    pending: () => pending.size,

    /* 播放地址探活：宁可放行，不误杀。
       只淘汰「明确 4xx/5xx」和「明确返回 HTML 错误页」的地址，
       其余（含 Content-Type 缺失、HEAD 不支持）一律放行，由播放器自身兜底重试。 */
    probe (url) {
      return new Promise((resolve) => {
        try {
          if (window.NAPI && window.NAPI.probe) {
            const r = JSON.parse(window.NAPI.probe(url))
            const status = Number(r && r.status) || 0
            const ct = String((r && r.type) || '').toLowerCase()
            if (status >= 200 && status < 400) {
              if (/text\/html/.test(ct)) return resolve(false)
              return resolve(true)
            }
            if (status >= 400 && status !== 405 && status !== 501 && status !== 403) return resolve(false)
            /* 403 有时是防盗链但浏览器带 Referer 能播 → 放行 */
          }
        } catch (e) {}
        resolve(true)
      })
    },
  }

  /* 供 LX 脚本层（music-libs）使用的回调式 request */
  globalThis.__REQ__ = function (url, opts, cb) {
    request(url, opts).then(function (r) {
      cb(null, { statusCode: r.status, body: r.body, headers: {} }, r.body)
    }).catch(function (e) { cb(e) })
  }
})()
