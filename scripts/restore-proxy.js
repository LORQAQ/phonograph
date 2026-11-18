'use strict'
/* proxyStream 恢复最简可靠版：直接转发（含 3xx），不做内容拦截、不做递归 */
const fs = require('node:fs')
const p = 'app/server.js'
let s = fs.readFileSync(p, 'utf8')

const start = s.indexOf('function proxyStream (')
if (start < 0) { console.log('未找到 proxyStream'); process.exit(1) }
/* 结束位置：下一个顶层 function 或 const 定义 */
let end = s.indexOf('\nfunction ', start + 10)
const alt = s.indexOf('\nconst ', start + 10)
if (end < 0 || (alt > 0 && alt < end)) end = alt
if (end < 0) end = s.indexOf('\n\nasync function', start + 10)
if (end < 0) { console.log('未找到结束位置'); process.exit(1) }

const impl = `function proxyStream (req, res, targetUrl, opts = {}) {
  let u
  try { u = new URL(targetUrl) } catch (e) { return json(res, 400, { error: '无效的音频地址' }) }
  const lib = u.protocol === 'https:' ? https : http
  const headers = { 'User-Agent': UA, Referer: refererFor(targetUrl), Accept: '*/*' }
  if (req.headers.range) headers.Range = req.headers.range

  const upstream = lib.get(u, { headers, timeout: 30000 }, (up) => {
    /* 3xx 直接透传给播放器，让它自己跟随（audio 元素会自动跟） */
    const outHeaders = {
      'Content-Type': up.headers['content-type'] || 'audio/mpeg',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
    }
    if (up.headers['content-length']) outHeaders['Content-Length'] = up.headers['content-length']
    if (up.headers['content-range']) outHeaders['Content-Range'] = up.headers['content-range']
    if (up.headers.location) outHeaders.Location = up.headers.location
    if (opts.filename) {
      const ct = String(up.headers['content-type'] || '').toLowerCase()
      const realExt = /mp4|m4a|aac/.test(ct) ? '.m4a' : /flac/.test(ct) ? '.flac' : /ogg/.test(ct) ? '.ogg' : '.mp3'
      if (!opts.filename.toLowerCase().endsWith(realExt)) {
        opts.filename = opts.filename.replace(/\\.[a-z0-9]+$/i, realExt)
      }
      outHeaders['Content-Disposition'] = 'attachment; filename="' + encodeURIComponent(opts.filename) + '"; filename*=UTF-8\\'\\'' + encodeURIComponent(opts.filename)
    }
    res.writeHead(up.statusCode, outHeaders)
    up.pipe(res)
  })
  upstream.on('error', (e) => {
    if (!res.headersSent) json(res, 502, { error: '音频请求失败：' + e.message })
    else try { res.end() } catch (x) { }
  })
  upstream.setTimeout(30000, () => { try { upstream.destroy() } catch (e) { } })
  return upstream
}
`

s = s.slice(0, start) + impl + s.slice(end)
fs.writeFileSync(p, s, 'utf8')
console.log('proxyStream 已恢复简版')
