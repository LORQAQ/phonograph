'use strict'
/* audit6 测试辅助：静态 JS 服务，用于测 /api/sources/import */
const http = require('node:http')
const CODE = [
  '/* @name ImpTest @version 1.0.0 @author audit6 */',
  "globalThis.lx.on('request', () => Promise.resolve('http://127.0.0.1:1/x.mp3'))",
  "globalThis.lx.send('inited', { sources: { wy: { name: 'ImpTest', type: 'music', actions: ['musicUrl'], qualitys: ['320k'] } } })",
  '',
].join('\n')
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/javascript' })
  res.end(CODE)
})
server.listen(37798, '127.0.0.1', () => console.log('src-server on 37798, bytes=' + CODE.length))