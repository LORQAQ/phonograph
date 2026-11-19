'use strict'
/* 用本机真实 IP 测 sameOrigin */
const path = require('node:path')
const http = require('node:http')
const os = require('node:os')
process.chdir(path.resolve(__dirname, '..'))

const BASE = 'http://127.0.0.1:37621'

function getWithOrigin (origin) {
  return new Promise((resolve) => {
    const q = http.get(BASE + '/api/health', { headers: { Origin: origin }, timeout: 8000 }, (res) => {
      let d = ''
      res.on('data', (c) => { d += c })
      res.on('end', () => resolve({ status: res.statusCode, body: d.slice(0, 90) }))
    })
    q.on('error', () => resolve({ status: 0 }))
  })
}

;(async () => {
  /* 拿本机所有网卡 IP */
  const ips = []
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) ips.push(i.address)
  }
  console.log('本机 IPv4: ' + (ips.join(', ') || '(无)'))

  const h = await new Promise((resolve) => {
    http.get(BASE + '/api/lan', { timeout: 8000 }, (res) => {
      let d = ''
      res.on('data', (c) => { d += c })
      res.on('end', () => resolve({ body: d }))
    }).on('error', () => resolve({ body: '' }))
  })
  console.log('/api/lan: ' + h.body.slice(0, 120))

  console.log('\n=== sameOrigin 测试 ===')
  for (const ip of ips) {
    const r = await getWithOrigin('http://' + ip + ':37621')
    console.log('  Origin=http://' + ip + ':37621 → ' + r.status + (r.status === 200 ? ' ✓ 放行' : ' ✗ 403'))
  }
  const local = await getWithOrigin('http://127.0.0.1:37621')
  console.log('  Origin=http://127.0.0.1:37621 → ' + local.status + (local.status === 200 ? ' ✓' : ''))
  const evil = await getWithOrigin('https://evil.com')
  console.log('  Origin=https://evil.com → ' + evil.status + (evil.status === 403 ? ' ✓ 拦截' : ' ✗ 未拦'))
  const fake = await getWithOrigin('http://192.168.1.5:37621')
  console.log('  Origin=http://192.168.1.5:37621（非本机）→ ' + fake.status + (fake.status === 403 ? ' ✓ 拦截' : ' ⚠ 放行'))
})()
