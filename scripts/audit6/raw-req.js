'use strict'
/* audit6 原始 HTTP 测试：可自定义 Host / Origin 头
   用法: node raw-req.js <port> <host-header> <origin-header> <method> <path> [jsonBody] */
const net = require('node:net')
const [,, port, hostHeader, originHeader, method, path, body] = process.argv
const payload = body || ''
const lines = [
  method + ' ' + path + ' HTTP/1.1',
  'Host: ' + hostHeader,
  'Origin: ' + originHeader,
  'Content-Type: application/json',
  'Content-Length: ' + Buffer.byteLength(payload),
  'Connection: close',
  '',
  payload,
]
const sock = net.connect(Number(port), '127.0.0.1', () => sock.write(lines.join('\r\n')))
let out = ''
sock.setTimeout(10000, () => { console.log('TIMEOUT\n' + out.slice(0, 600)); sock.destroy() })
sock.on('data', (c) => { out += c.toString('utf8') })
sock.on('close', () => console.log(out.split('\r\n')[0] + '\nBODY: ' + out.split('\r\n\r\n').slice(1).join('\r\n\r\n').slice(0, 300)))
sock.on('error', (e) => console.log('ERR ' + e.message))