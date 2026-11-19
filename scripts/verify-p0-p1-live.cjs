'use strict'
/* 实测 P0/P1 修复 */
const path = require('node:path')
const http = require('node:http')
process.chdir(path.resolve(__dirname, '..'))

const BASE = 'http://127.0.0.1:37621'

function req (p, opts) {
  return new Promise((resolve) => {
    const o = Object.assign({ timeout: 15000 }, opts || {})
    const q = http.request(BASE + p, o, (res) => {
      let d = ''
      res.on('data', (c) => { d += c })
      res.on('end', () => resolve({ status: res.statusCode, body: d.slice(0, 150) }))
    })
    q.on('error', (e) => resolve({ status: 0, err: e.message }))
    q.on('timeout', () => { q.destroy(); resolve({ status: 0, err: 'timeout' }) })
    if (o.body) q.write(o.body)
    q.end()
  })
}

;(async () => {
  console.log('=== P0-1 /api/download-dir GET 不再 405 ===')
  const d1 = await req('/api/download-dir')
  console.log('  GET /api/download-dir → ' + d1.status + (d1.status === 200 ? ' ✓' : ' ✗ 仍 405') + '  ' + d1.body.slice(0, 80))

  const d2 = await req('/api/download-dir?set=' + encodeURIComponent('C:\\Temp\\dl'))
  console.log('  GET ?set= → ' + d2.status + (d2.status === 405 ? ' ✓ 拦截' : ' ⚠ 放行') + '  ' + d2.body.slice(0, 60))

  const d3 = await req('/api/download-dir?set=' + encodeURIComponent('C:\\Temp\\dl'), { method: 'POST' })
  console.log('  POST ?set= → ' + d3.status + (d3.status === 200 ? ' ✓' : '') + '  ' + d3.body.slice(0, 80))

  console.log('\n=== P1-2 LAN Origin 不再 403 ===')
  const lan = await new Promise((resolve) => {
    const q = http.get(BASE + '/api/health', { headers: { Origin: 'http://192.168.1.5:37621' }, timeout: 8000 }, (res) => {
      let d = ''
      res.on('data', (c) => { d += c })
      res.on('end', () => resolve({ status: res.statusCode, body: d.slice(0, 80) }))
    })
    q.on('error', () => resolve({ status: 0 }))
  })
  console.log('  Origin=192.168.x → ' + lan.status + (lan.status === 200 ? ' ✓' : ' ⚠ ' + lan.body.slice(0, 60)))

  const same = await new Promise((resolve) => {
    const q = http.get(BASE + '/api/health', { headers: { Origin: 'http://127.0.0.1:37621' }, timeout: 8000 }, (res) => {
      let d = ''
      res.on('data', (c) => { d += c })
      res.on('end', () => resolve({ status: res.statusCode }))
    })
    q.on('error', () => resolve({ status: 0 }))
  })
  console.log('  Origin=本机 → ' + same.status + (same.status === 200 ? ' ✓' : ''))

  const evil = await new Promise((resolve) => {
    const q = http.get(BASE + '/api/health', { headers: { Origin: 'https://evil.com' }, timeout: 8000 }, (res) => {
      let d = ''
      res.on('data', (c) => { d += c })
      res.on('end', () => resolve({ status: res.statusCode }))
    })
    q.on('error', () => resolve({ status: 0 }))
  })
  console.log('  Origin=evil.com → ' + evil.status + (evil.status === 403 ? ' ✓ 仍拦' : ' ⚠ 放行了'))

  console.log('\n=== P1-3 downloads/remove 需要 POST ===')
  const r1 = await req('/api/downloads/remove?name=test.mp3')
  console.log('  GET → ' + r1.status + (r1.status === 405 ? ' ✓ 拦截' : ' ⚠ 未拦'))
  const r2 = await req('/api/downloads/remove?name=test.mp3', { method: 'POST' })
  console.log('  POST → ' + r2.status + '  ' + r2.body.slice(0, 60))

  console.log('\n=== P1-1 冷启动按平台判 ===')
  const kg = await req('/api/url?id=test123&source=kg&quality=320k', { method: 'GET', timeout: 30000 })
  console.log('  /api/url source=kg → ' + kg.status + '  ' + kg.body.slice(0, 100))
})()
