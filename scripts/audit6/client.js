'use strict'
/* audit6 测试客户端：node client.js POST http://host/path '{"json":...}' */
const http = require('node:http')
const [,, method, url, body] = process.argv
const u = new URL(url)
const payload = Buffer.from(body || '', 'utf8')
const t0 = Date.now()
const req = http.request({
  hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: method || 'GET',
  headers: { 'Content-Type': 'application/json', 'Content-Length': payload.length },
}, (res) => {
  const chunks = []
  res.on('data', (c) => chunks.push(c))
  res.on('end', () => {
    const text = Buffer.concat(chunks).toString('utf8')
    console.log('HTTP ' + res.statusCode + ' in ' + ((Date.now() - t0) / 1000).toFixed(2) + 's')
    console.log(text.slice(0, 1200))
  })
})
req.setTimeout(45000, () => { console.log('CLIENT TIMEOUT after ' + ((Date.now() - t0) / 1000).toFixed(1) + 's'); req.destroy() })
req.on('error', (e) => console.log('CLIENT ERROR ' + e.message + ' after ' + ((Date.now() - t0) / 1000).toFixed(2) + 's'))
req.end(payload)