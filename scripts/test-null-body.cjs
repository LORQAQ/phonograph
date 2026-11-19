'use strict'
/* 验证 body=null 时的空值崩溃 */
const http = require('node:http')
const BASE = 'http://127.0.0.1:37621'

function post (path, rawBody, ct) {
  return new Promise((resolve) => {
    const q = http.request(BASE + path, {
      method: 'POST',
      timeout: 20000,
      headers: rawBody ? { 'Content-Type': ct || 'application/json', 'Content-Length': Buffer.byteLength(rawBody) } : {},
    }, (res) => {
      let d = ''
      res.on('data', (c) => { d += c })
      res.on('end', () => resolve({ status: res.statusCode, body: d.slice(0, 150) }))
    })
    q.on('error', (e) => resolve({ status: 0, err: e.message }))
    if (rawBody) q.write(rawBody)
    q.end()
  })
}

;(async () => {
  console.log('=== body 为 null 时各 action 的行为 ===\n')

  const cases = [
    ['rename（畸形JSON）', '/api/playlist', '{', 'application/json'],
    ['delete（畸形JSON）', '/api/playlist', '{', 'application/json'],
    ['add（畸形JSON）', '/api/playlist', '{', 'application/json'],
    ['rename（空body）', '/api/playlist?action=rename', '', null],
    ['delete（空body）', '/api/playlist?action=delete', '', null],
    ['add（空body）', '/api/playlist?action=add', '', null],
    ['rename（null）', '/api/playlist', 'null', 'application/json'],
    ['delete（null）', '/api/playlist', 'null', 'application/json'],
  ]

  for (const [label, path, body, ct] of cases) {
    const r = await post(path, body, ct)
    const is500 = r.status === 500
    const is400 = r.status === 400
    const ok = r.status === 200
    console.log('  ' + label.padEnd(20) + ' → ' + String(r.status).padStart(3) +
      (is500 ? ' ⚠ 500' : is400 ? ' 400' : ok ? ' 200' : ' ?') +
      '  ' + (r.body || r.err || '').slice(0, 70))
  }

  console.log('\n=== 其他接口的 body=null ===')
  const others = [
    ['/api/settings', '{}'],
    ['/api/sources/import', '{'],
    ['/api/db', '{'],
  ]
  for (const [path, body] of others) {
    const r = await post(path, body)
    console.log('  ' + path.padEnd(24) + ' → ' + r.status + '  ' + (r.body || r.err || '').slice(0, 60))
  }
})()
