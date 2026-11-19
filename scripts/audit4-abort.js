'use strict'
/* 审计用：验证 B32 的 res.destroy(new Error('UPSTREAM_ABORTED')) 到底能不能传到前端 */
const http = require('node:http')

let uncaught = null
process.on('uncaughtException', (e) => {
  uncaught = e
  console.log('[server uncaughtException]', e && e.message)
})

/* ---- 上游：发一半就断 ---- */
const upstream = http.createServer((req, res) => {
  if (req.url === '/half') {
    res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': '1000' })
    res.write(Buffer.alloc(100, 1))
    setTimeout(() => res.destroy(new Error('upstream boom')), 60)
    return
  }
  if (req.url === '/chunked') {
    res.writeHead(200, { 'Content-Type': 'audio/mpeg' })
    res.write(Buffer.alloc(100, 1))
    setTimeout(() => res.destroy(new Error('upstream boom')), 60)
    return
  }
})

/* ---- 复刻 server.js proxyStream 的失败收尾（B32） ---- */
function proxyLike (targetUrl, res) {
  let finished = false
  let upstreamReq = null
  const fail = (code, msg) => {
    if (finished) return
    finished = true
    try { if (upstreamReq) upstreamReq.destroy() } catch (e) { }
    if (!res.headersSent) {
      try { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: msg })) } catch (e) { }
      return
    }
    try { res.destroy(new Error('UPSTREAM_ABORTED')) } catch (e) { }
  }
  upstreamReq = http.get(targetUrl, { timeout: 25000 }, (up) => {
    res.writeHead(up.statusCode, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' })
    up.pipe(res)
    up.on('error', () => fail(502, '音频流中断'))
    up.on('aborted', () => fail(502, '音频流被上游中断'))
    res.on('close', () => { finished = true; try { up.destroy() } catch (e) { } })
  })
  upstreamReq.on('error', (e) => fail(502, '音频代理失败: ' + e.message))
}

const proxy = http.createServer((req, res) => {
  proxyLike('http://127.0.0.1:' + upstream.address().port + req.url, res)
})

function clientHit (path) {
  return new Promise((resolve) => {
    const out = { path, chunks: 0, bytes: 0, error: null, end: false, aborted: false }
    const r = http.get('http://127.0.0.1:' + proxy.address().port + path, (res) => {
      out.status = res.statusCode
      out.headers = res.headers
      res.on('data', (c) => { out.chunks++; out.bytes += c.length })
      res.on('aborted', () => { out.aborted = true })
      res.on('error', (e) => { out.error = e.code + ': ' + e.message })
      res.on('end', () => { out.end = true; resolve(out) })
    })
    r.on('error', (e) => { out.error = out.error || ('req ' + e.code + ': ' + e.message); resolve(out) })
    setTimeout(() => resolve(out), 3000)
  })
}

upstream.listen(0, '127.0.0.1', () => {
  proxy.listen(0, '127.0.0.1', async () => {
    for (const p of ['/half', '/chunked']) {
      const r = await clientHit(p)
      console.log('\n### 客户端视角 ' + p)
      console.log(JSON.stringify(r, null, 2))
      console.log('客户端能看到的错误名是否含 UPSTREAM_ABORTED ?', /UPSTREAM_ABORTED/.test(String(r.error)))
    }
    console.log('\n### 服务端 uncaughtException:', uncaught ? uncaught.message : '(无)')
    upstream.close(); proxy.close()
    setTimeout(() => process.exit(0), 200)
  })
})
