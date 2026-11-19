'use strict'
/* 验证第 4 批服务端修复 */
process.chdir(require('node:path').resolve(__dirname, '..'))

const http = require('node:http')
const BASE = 'http://127.0.0.1:37621'

function req (path, opts) {
  return new Promise((resolve) => {
    const o = Object.assign({ timeout: 20000 }, opts || {})
    const q = http.request(BASE + path, o, (res) => {
      let d = ''
      res.on('data', (c) => { d += c })
      res.on('end', () => resolve({ status: res.statusCode, body: d.slice(0, 140) }))
    })
    q.on('error', (e) => resolve({ status: 0, err: e.message }))
    q.on('timeout', () => { q.destroy(); resolve({ status: 0, err: 'timeout' }) })
    if (o.body) q.write(o.body)
    q.end()
  })
}

;(async () => {
  console.log('=== B30 playlist body=null 不再 500 ===')
  for (const act of ['rename', 'delete', 'add', 'clear']) {
    const r = await req('/api/playlist?action=' + act, { method: 'GET' })
    console.log('  GET ?action=' + act.padEnd(8) + ' → ' + String(r.status).padStart(3) + (r.status === 500 ? ' ⚠ 仍 500' : ' ✓') + '  ' + (r.body||r.err||'').slice(0, 60))
  }

  console.log('\n=== B31 大请求体返回 413 ===')
  const big = 'x'.repeat(6 * 1024 * 1024)
  const r31 = await req('/api/playlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(big) },
    body: big,
  })
  console.log('  6MB body → ' + r31.status + (r31.status === 413 ? ' ✓ 413' : r31.status === 0 ? ' ⚠ 连接被断（' + r31.err + '）' : '  ' + (r31.body||r31.err||'').slice(0, 60)))

  console.log('\n=== B33 畸形 URL 返回 400 ===')
  for (const p of ['//', '//[', 'http://[::1']) {
    const r = await req(p)
    console.log('  ' + p.padEnd(14) + ' → ' + String(r.status).padStart(3) + (r.status === 400 ? ' ✓' : r.status === 0 ? ' ⚠ 悬挂' : '') + '  ' + (r.body||r.err||'').slice(0, 50))
  }

  console.log('\n=== B32 /api/stream 正常流 ===')
  const r32 = await new Promise((resolve) => {
    const q = http.get(BASE + '/api/stream?id=33911781&source=wy&quality=320k', { timeout: 60000 }, (res) => {
      let n = 0
      res.on('data', (c) => { n += c.length; if (n > 300000) { res.destroy(); resolve({ status: res.statusCode, size: n, partial: true }) } })
      res.on('end', () => resolve({ status: res.statusCode, size: n, partial: false }))
      res.on('close', () => resolve({ status: res.statusCode, size: n, partial: true }))
    })
    q.on('error', (e) => resolve({ status: 0, err: e.message }))
    q.on('timeout', () => { q.destroy(); resolve({ status: 0, err: 'timeout' }) })
  })
  console.log('  status=' + r32.status + ' size=' + r32.size + (r32.partial ? '（主动断开，验证 close 清理）' : ''))

  console.log('\n=== B45 备份文件名 ===')
  const fs = require('node:fs')
  const dataDir = 'data'
  const baks = fs.existsSync(dataDir) ? fs.readdirSync(dataDir).filter((f) => f.includes('corrupt-')) : []
  console.log('  corrupt-* 备份数: ' + baks.length + (baks.length ? '（' + baks[0] + '）' : '（还没有损坏，正常）'))

  console.log('\n=== B34 临时文件 ===')
  const tmp = fs.existsSync(dataDir) ? fs.readdirSync(dataDir).filter((f) => f.startsWith('.dl_')) : []
  console.log('  .dl_* 残留: ' + tmp.length + (tmp.length === 0 ? ' ✓' : ' ⚠ ' + tmp.join(',')))
})()
