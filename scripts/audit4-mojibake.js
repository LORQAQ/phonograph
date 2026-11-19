'use strict'
/* Audit fixture: prove kugou-gcid.js request() corrupts UTF-8 when a Chinese char
   straddles a TCP chunk boundary (d += chunk decodes each chunk separately). */
const http = require('node:http')
const https = require('node:https')
const { EventEmitter } = require('node:events')

const payload = JSON.stringify({
  status: 1,
  err_code: 0,
  data: { list: [{ global_collection_id: 'collection_3_9_1', info: { title: '中文歌名测试' } }] },
})
const buf = Buffer.from(payload, 'utf8')
/* 在第一个中文字符的中间切一刀 */
const idx = payload.indexOf('中')
const cutByte = Buffer.byteLength(payload.slice(0, idx), 'utf8') + 1   /* 3 字节字符的中间 */

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': buf.length })
  res.write(buf.subarray(0, cutByte))
  setTimeout(() => res.end(buf.subarray(cutByte)), 30)
})

/* 把 https.request 指到本地 http 服务上，其余请求逻辑完全走被测代码 */
https.request = function (opts, cb) {
  return http.request({
    host: '127.0.0.1',
    port: server.address().port,
    path: opts.path,
    method: opts.method,
    headers: opts.headers,
  }, cb)
}

const kg = require('../app/lib/kugou-gcid.js')

server.listen(0, '127.0.0.1', async () => {
  try {
    const r = await kg.decodeGcid('gcid_3xnx57dpz2tz0b7')
    console.log('decoded OK ->', JSON.stringify(r))
    console.log('payload 原始中文: 中文歌名测试')
    console.log('解出来的中文   :', JSON.stringify(r.info.title))
    console.log('含替换字符 U+FFFD ?', /\uFFFD/.test(String(r.info.title)))
  } catch (e) {
    console.log('decode THROW:', e.message)
  }
  server.close()
})
