'use strict'
/* 验证第 2 批安全修复 */
const http = require('node:http')
const BASE = 'http://127.0.0.1:37621'

function get (path, headers) {
  return new Promise((resolve) => {
    const q = http.get(BASE + path, { timeout: 20000, headers: headers || {} }, (res) => {
      let d = ''
      res.on('data', (c) => { d += c })
      res.on('end', () => resolve({ status: res.statusCode, body: d.slice(0, 200) }))
    })
    q.on('error', (e) => resolve({ status: 0, err: e.message }))
    q.on('timeout', () => { q.destroy(); resolve({ status: 0, err: 'timeout' }) })
  })
}

;(async () => {
  console.log('=== B6 /api/pic SSRF 测试 ===')
  const picTests = [
    ['本机 db', '/api/pic?url=' + encodeURIComponent('http://127.0.0.1:37621/api/db')],
    ['内网 192.168', '/api/pic?url=' + encodeURIComponent('http://192.168.1.1/')],
    ['云元数据', '/api/pic?url=' + encodeURIComponent('http://169.254.169.254/latest/meta-data/')],
    ['file 协议', '/api/pic?url=' + encodeURIComponent('file:///C:/Windows/win.ini')],
    ['正常封面', '/api/pic?url=' + encodeURIComponent('https://p1.music.126.net/x.jpg')],
  ]
  for (const [label, p] of picTests) {
    const r = await get(p)
    const blocked = r.status === 403 || r.status === 400
    console.log('  ' + label.padEnd(14) + ' → ' + String(r.status).padStart(3) + (blocked ? ' ✓ 已拦' : ' ⚠ 放行') + '  ' + (r.body || '').slice(0, 60))
  }

  console.log('\n=== B15 reveal 路径测试 ===')
  const revealTests = [
    ['路径穿越', '/api/downloads/reveal?name=' + encodeURIComponent('..\\..\\Windows\\win.ini')],
    ['绝对路径', '/api/downloads/reveal?name=' + encodeURIComponent('C:\\Windows\\win.ini')],
    ['非音频', '/api/downloads/reveal?name=' + encodeURIComponent('test.txt')],
    ['正常名', '/api/downloads/reveal?name=' + encodeURIComponent('a.mp3')],
  ]
  for (const [label, p] of revealTests) {
    const r = await get(p)
    const leaked = r.body.includes('C:\\Windows') || r.body.includes('win.ini')
    console.log('  ' + label.padEnd(10) + ' → ' + String(r.status).padStart(3) + (leaked ? ' ⚠ 泄漏路径' : ' ok') + '  ' + (r.body || '').slice(0, 70))
  }

  console.log('\n=== B14 remove 的 dir 参数 ===')
  const r14 = await get('/api/downloads/remove?name=a.mp3&dir=' + encodeURIComponent('C:\\Windows'))
  console.log('  带 dir=C:\\Windows → ' + r14.status + '  ' + (r14.body || '').slice(0, 80))

  console.log('\n=== B51 Cookie 脱敏 ===')
  const settings = await get('/api/settings')
  const hasRawCookie = /"qqCookie"\s*:\s*"[^"]{10,}/.test(settings.body)
  console.log('  /api/settings 含原始 qqCookie: ' + (hasRawCookie ? '⚠ 是' : '✓ 否'))
  console.log('  ' + settings.body.slice(0, 150))

  const db = await get('/api/db')
  const dbRaw = /"qqCookie"\s*:\s*"[^"]{10,}/.test(db.body)
  console.log('  /api/db 含原始 qqCookie: ' + (dbRaw ? '⚠ 是' : '✓ 否'))

  console.log('\n=== B39 数字参数 ===')
  const r39a = await get('/api/search?kw=test&limit=abc&page=abc')
  console.log('  limit=abc page=abc → ' + r39a.status + '  ' + (r39a.body || '').slice(0, 60))
  const r39b = await get('/api/search?kw=test&limit=-5')
  console.log('  limit=-5 → ' + r39b.status)

  console.log('\n=== B7 来源校验 ===')
  const evil = await get('/api/shutdown', { Origin: 'https://evil.com' })
  console.log('  Origin: evil.com → /api/shutdown POST 需要，这里测 GET')
  const r7b = await get('/api/settings', { Origin: 'https://evil.com' })
  console.log('  /api/settings Origin=evil → ' + r7b.status)
  const r7c = await get('/api/settings', { Origin: 'http://127.0.0.1:37621' })
  console.log('  /api/settings Origin=本机 → ' + r7c.status)
})()
