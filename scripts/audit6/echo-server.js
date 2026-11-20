'use strict'
/* audit6 回显服务：把收到的 method/path/headers/body 打回，用于验证客户端是否真的发了 body */
const http = require('node:http')
const server = http.createServer((req, res) => {
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    const body = Buffer.concat(chunks).toString('utf8')
    console.log('--- hit', req.method, req.url, 'len=' + body.length)
    console.log(JSON.stringify({ headers: req.headers, body }))
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ method: req.method, url: req.url, len: body.length, body, headers: req.headers }))
  })
})
server.listen(37797, '127.0.0.1', () => console.log('echo-server on 37797'))