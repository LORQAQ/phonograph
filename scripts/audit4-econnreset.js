'use strict'
/* Audit: prove json(res, e.code || 500) blows up when e.code is a string (ECONNRESET)
   -> client receives nothing and the server logs an unhandled rejection. */
const net = require('node:net')

const PORT = Number(process.argv[2] || 37622)

const sock = net.connect(PORT, '127.0.0.1', () => {
  /* POST 声明一个 1MB 的 body，一个字节都不发就断开 -> readBody 的 req error = ECONNRESET */
  sock.write(
    'POST /api/playlist HTTP/1.1\r\n' +
    'Host: 127.0.0.1:' + PORT + '\r\n' +
    'Content-Type: application/json\r\n' +
    'Content-Length: 1048576\r\n\r\n'
  )
  setTimeout(() => {
    let got = ''
    sock.on('data', (d) => { got += d })
    setTimeout(() => {
      sock.destroy()
      console.log('client received bytes:', got.length)
      console.log('client saw status line:', JSON.stringify(got.split('\r\n')[0] || ''))
    }, 800)
  }, 300)
})
sock.on('error', (e) => console.log('socket error:', e.message))
setTimeout(() => process.exit(0), 3000)
