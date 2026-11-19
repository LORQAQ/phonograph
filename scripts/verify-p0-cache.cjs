'use strict'
/* 验证 P0-1：同一首歌第二次播放 */
const path = require('node:path')
const http = require('node:http')
process.chdir(path.resolve(__dirname, '..'))
const BASE = 'http://127.0.0.1:37621'

function get (p, timeout = 60000) {
  return new Promise((resolve) => {
    const t0 = Date.now()
    const q = http.get(BASE + p, { timeout }, (res) => {
      let d = ''
      res.on('data', (c) => { d += c })
      res.on('end', () => resolve({ status: res.statusCode, body: d, ms: Date.now() - t0 }))
    })
    q.on('error', (e) => resolve({ status: 0, err: e.message, ms: Date.now() - t0 }))
    q.on('timeout', () => { q.destroy(); resolve({ status: 0, err: 'timeout', ms: Date.now() - t0 }) })
  })
}

;(async () => {
  const h = await get('/api/health', 8000)
  if (h.status !== 200) { console.log('服务没起来'); return }

  const top = await get('/api/toplist?type=hot&source=wy', 40000)
  let list = []
  try { list = JSON.parse(top.body).list || [] } catch (e) { }
  if (!list.length) { console.log('拿不到榜单'); return }

  const s = list[0]
  const qs = new URLSearchParams({ id: s.id, source: 'wy', quality: '320k' })

  console.log('=== P0-1 同一首歌播两次 ===')
  const r1 = await get('/api/url?' + qs.toString(), 60000)
  let j1 = null
  try { j1 = JSON.parse(r1.body) } catch (e) { }
  console.log('  第 1 次: ' + r1.ms + 'ms  url=' + (j1 && j1.url ? '有' : '无'))

  const r2 = await get('/api/url?' + qs.toString(), 30000)
  let j2 = null
  try { j2 = JSON.parse(r2.body) } catch (e) { }
  console.log('  第 2 次: ' + r2.ms + 'ms  url=' + (j2 && j2.url ? '有 ✓' : '无 ✗'))
  if (j2 && !j2.url) {
    console.log('  响应: ' + r2.body.slice(0, 200))
    console.log('  ← P0-1 还在（缓存双层包装）')
  }

  console.log('\n=== /api/stream 二次请求 ===')
  for (let i = 1; i <= 2; i++) {
    const t0 = Date.now()
    const r = await new Promise((resolve) => {
      const q = http.get(BASE + '/api/stream?' + qs.toString(), { timeout: 30000 }, (res) => {
        let got = 0
        res.on('data', (c) => {
          got += c.length
          if (got >= 32768) { res.destroy(); resolve({ status: res.statusCode, got, ms: Date.now() - t0 }) }
        })
        res.on('end', () => resolve({ status: res.statusCode, got, ms: Date.now() - t0 }))
        res.on('error', () => resolve({ status: res.statusCode, got, ms: Date.now() - t0 }))
      })
      q.on('error', (e) => resolve({ status: 0, err: e.message, got: 0, ms: Date.now() - t0 }))
      q.on('timeout', () => { q.destroy(); resolve({ status: 0, err: 'timeout', got: 0, ms: Date.now() - t0 }) })
    })
    console.log('  第 ' + i + ' 次: status=' + r.status + '  ' + r.got + ' bytes  ' + r.ms + 'ms  ' + (r.status === 200 && r.got > 0 ? '✓' : '✗ ' + (r.err || '')))
  }

  console.log('\n=== P0-2 Origin:null ===')
  const nul = await new Promise((resolve) => {
    const q = http.get(BASE + '/api/health', { headers: { Origin: 'null' }, timeout: 8000 }, (res) => {
      let d = ''
      res.on('data', (c) => { d += c })
      res.on('end', () => resolve({ status: res.statusCode }))
    })
    q.on('error', () => resolve({ status: 0 }))
  })
  console.log('  Origin:null → ' + nul.status + (nul.status === 403 ? ' ✓ 已拒绝' : ' ✗ 仍放行'))

  console.log('\n=== P0-2 text/plain 写接口 ===')
  const tp = await new Promise((resolve) => {
    const body = JSON.stringify({ volume: 0.5 })
    const q = http.request(BASE + '/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', 'Content-Length': Buffer.byteLength(body), Origin: 'null' },
      timeout: 8000,
    }, (res) => {
      let d = ''
      res.on('data', (c) => { d += c })
      res.on('end', () => resolve({ status: res.statusCode }))
    })
    q.on('error', () => resolve({ status: 0 }))
    q.write(body)
    q.end()
  })
  console.log('  text/plain POST → ' + tp.status + (tp.status === 415 ? ' ✓ 已拦截' : ' ⚠ ' + tp.status))
})()
