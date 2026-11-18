'use strict'
/* proxyStream 跟随 3xx 重定向（念心等中转源会先 301 到 https），最多 5 跳 */
const fs = require('node:fs')
const p = 'app/server.js'
let s = fs.readFileSync(p, 'utf8')

const old = `function proxyStream (req, res, targetUrl, opts = {}) {
  let u
  try { u = new URL(targetUrl) } catch (e) { return json(res, 400, { error: '无效的音频地址' }) }
  const lib = u.protocol === 'https:' ? https : http
  const headers = { 'User-Agent': UA, Referer: refererFor(targetUrl), Accept: '*/*' }
  if (req.headers.range) headers.Range = req.headers.range`

const neu = `function proxyStream (req, res, targetUrl, opts = {}, hop = 0) {
  let u
  try { u = new URL(targetUrl) } catch (e) { return json(res, 400, { error: '无效的音频地址' }) }
  const lib = u.protocol === 'https:' ? https : http
  const headers = { 'User-Agent': UA, Referer: refererFor(targetUrl), Accept: '*/*' }
  if (req.headers.range) headers.Range = req.headers.range`

if (s.includes(old)) {
  s = s.replace(old, neu)
}

/* 在 statusCode 判断里加 3xx 跟随 */
const oldUp = `  const upstream = lib.get(u, { headers, timeout: 25000 }, (up) => {
    if (up.statusCode >= 400) {
      up.resume()
      return json(res, 502, { error: '音频源返回 ' + up.statusCode })
    }`
const newUp = `  const upstream = lib.get(u, { headers, timeout: 25000 }, (up) => {
    /* 跟随重定向：中转源常常 301 → https 或跳到真实 CDN */
    if (up.statusCode >= 300 && up.statusCode < 400 && up.headers.location && hop < 5) {
      up.resume()
      let next = up.headers.location
      try { next = new URL(next, targetUrl).toString() } catch (e) { }
      return proxyStream(req, res, next, opts, hop + 1)
    }
    if (up.statusCode >= 400) {
      up.resume()
      return json(res, 502, { error: '音频源返回 ' + up.statusCode })
    }`

if (s.includes(oldUp)) {
  s = s.replace(oldUp, newUp)
  fs.writeFileSync(p, s, 'utf8')
  console.log('重定向跟随已加')
} else {
  fs.writeFileSync(p, s, 'utf8')
  console.log('statusCode 块未匹配，已保存其他改动')
}
