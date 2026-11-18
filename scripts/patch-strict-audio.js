'use strict'
/* 强化 strictAudioUrl：HEAD 通过后再嗅探前 64 字节，挡掉 JSON/HTML 错误页 */
const fs = require('node:fs')
const p = 'app/server.js'
let s = fs.readFileSync(p, 'utf8')

const start = s.indexOf('function strictAudioUrl (url) {')
if (start < 0) { console.log('未找到 strictAudioUrl'); process.exit(1) }
const end = s.indexOf('function proxyStream (req, res, targetUrl', start)
if (end < 0) { console.log('未找到 proxyStream'); process.exit(1) }

const impl = `function strictAudioUrl (url) {
  return new Promise((resolve) => {
    let done = false
    const finish = (v) => { if (!done) { done = true; resolve(v) } }

    /* 第二步：拉前 64 字节，确认不是 JSON / HTML 错误内容 */
    const sniff = () => {
      try {
        const u = new URL(url)
        const lib = u.protocol === 'https:' ? https : http
        const r2 = lib.get(u, {
          headers: { 'User-Agent': UA, Referer: refererFor(url), Range: 'bytes=0-63' },
          timeout: 8000,
        }, (up2) => {
          const chunks = []
          up2.on('data', (c) => { if (chunks.length < 4) chunks.push(c) })
          up2.on('end', () => {
            const buf = Buffer.concat(chunks).slice(0, 64)
            const head = buf.toString('latin1').trim()
            if (/^[{[]/.test(head)) return finish(false)
            if (/^<(!doctype|html|\\?xml)/i.test(head)) return finish(false)
            finish(buf.length > 0)
          })
          up2.on('error', () => finish(true))
        })
        r2.on('error', () => finish(true))
        r2.setTimeout(8000, () => { try { r2.destroy() } catch (e) {} finish(true) })
      } catch (e) { finish(true) }
    }

    try {
      const u = new URL(url)
      const lib = u.protocol === 'https:' ? https : http
      const r = lib.request(u, {
        method: 'HEAD',
        headers: { 'User-Agent': UA, Referer: refererFor(url), Accept: '*/*' },
        timeout: 8000,
      }, (up) => {
        up.resume()
        const ct = String(up.headers['content-type'] || '').toLowerCase()
        if (up.statusCode >= 400) return finish(false)
        if (ct.includes('text/html') || ct.includes('application/json')) return finish(false)
        if (ct && !/audio|video|octet|mpeg|flac|ogg/.test(ct)) return finish(false)
        sniff()
      })
      r.on('error', () => finish(true))
      r.setTimeout(8000, () => { try { r.destroy() } catch (e) {} finish(true) })
      r.end()
    } catch (e) { finish(false) }
  })
}

`

s = s.slice(0, start) + impl + s.slice(end)
fs.writeFileSync(p, s, 'utf8')
console.log('strictAudioUrl 已强化:', s.includes('sniff()'))
