'use strict'
/* audit6 测试辅助：一个自我重定向的 HTTP 服务，用于验证 fetchText / sources/import 无跳数上限 */
const http = require('node:http')
let hits = 0
let maxSeen = 0
const CAP = 300
const server = http.createServer((req, res) => {
  hits++
  if (hits > maxSeen) maxSeen = hits
  if (hits <= CAP) {
    res.writeHead(302, { Location: 'http://127.0.0.1:37799/loop' })
    res.end()
    return
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('// audit6 stop marker\n')
})
server.listen(37799, '127.0.0.1', () => console.log('loop-server on 37799, cap=' + CAP))
process.on('SIGTERM', () => { console.log('hits=' + hits); process.exit(0) })
setInterval(() => console.log('hits=' + hits), 1000)