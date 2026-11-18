'use strict'
/* 修正 strictAudioUrl：用与播放一致的「无 Range」GET 嗅探前 64 字节 */
const fs = require('node:fs')
const p = 'app/server.js'
let s = fs.readFileSync(p, 'utf8')

/* 1) sniff 去掉 Range，拿第一个数据块就判断 */
s = s.replace(
  "          headers: { 'User-Agent': UA, Referer: refererFor(url), Range: 'bytes=0-63' },",
  "          headers: { 'User-Agent': UA, Referer: refererFor(url), Accept: '*/*' },"
)
s = s.replace(
  `          const chunks = []
          up2.on('data', (c) => { if (chunks.length < 4) chunks.push(c) })
          up2.on('end', () => {
            const buf = Buffer.concat(chunks).slice(0, 64)
            const head = buf.toString('latin1').trim()
            if (/^[{[]/.test(head)) return finish(false)
            if (/^<(!doctype|html|\\?xml)/i.test(head)) return finish(false)
            finish(buf.length > 0)
          })
          up2.on('error', () => finish(true))`,
  `          let judged = false
          up2.on('data', (c) => {
            if (judged) return
            judged = true
            const head = c.slice(0, 64).toString('latin1').trim()
            try { up2.destroy() } catch (e) {}
            if (/^[{[]/.test(head)) return finish(false)
            if (/^<(!doctype|html|\\?xml)/i.test(head)) return finish(false)
            finish(c.length > 0)
          })
          up2.on('end', () => { if (!judged) finish(false) })
          up2.on('error', () => finish(true))`
)

/* 2) proxyStream 也拦 JSON */
s = s.replace(
  `    if (upType.includes('text/html')) {
      up.resume()
      return json(res, 502, { error: '该音频地址已失效（返回了网页）' })
    }`,
  `    if (upType.includes('text/html') || upType.includes('application/json')) {
      up.resume()
      return json(res, 502, { error: '该音频地址已失效（返回了网页/错误信息）' })
    }`
)

fs.writeFileSync(p, s, 'utf8')
console.log('sniff 无 Range:', s.includes("Referer: refererFor(url), Accept: '*/*' },"))
console.log('proxyStream 拦 JSON:', s.includes("upType.includes('application/json')"))
