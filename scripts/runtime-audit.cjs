'use strict'
/* 运行时审查：实测服务端行为（静态审查抓不到的） */
const http = require('node:http')

const BASE = 'http://127.0.0.1:37621'

function get (path, timeout = 30000) {
  return new Promise((resolve) => {
    const t0 = Date.now()
    const q = http.get(BASE + path, { timeout }, (res) => {
      let d = ''
      res.on('data', (c) => { d += c })
      res.on('end', () => resolve({ status: res.statusCode, body: d, ms: Date.now() - t0, ct: res.headers['content-type'] || '' }))
    })
    q.on('error', (e) => resolve({ status: 0, err: e.message, ms: Date.now() - t0 }))
    q.on('timeout', () => { q.destroy(); resolve({ status: 0, err: 'timeout', ms: Date.now() - t0 }) })
  })
}

;(async () => {
  const results = []

  /* 1. 健康检查 */
  const h = await get('/api/health')
  console.log('[1] /api/health: ' + h.status + ' ' + h.body.slice(0, 80))

  /* 2. 路径穿越测试 */
  console.log('\n[2] 路径穿越')
  for (const p of ['/../../../etc/passwd', '/..%2f..%2fdata%2fdb.json', '/../data/db.json', '/public2/x.js']) {
    const r = await get(p)
    const leaked = r.status === 200 && (r.body.includes('root:') || r.body.includes('"playlists"'))
    console.log('  ' + p.padEnd(32) + ' → ' + r.status + (leaked ? ' ⚠ 泄漏!' : ' ok'))
  }

  /* 3. 下载删除的路径校验 */
  console.log('\n[3] /api/downloads/remove 路径校验')
  for (const name of ['../../../data/db.json', '..\\..\\data\\db.json', 'test.txt', 'a/../../x.mp3']) {
    const r = await get('/api/downloads/remove?name=' + encodeURIComponent(name))
    const bad = r.status === 200 && r.body.includes('"ok":true')
    console.log('  ' + name.padEnd(32) + ' → ' + r.status + (bad ? ' ⚠ 被删了!' : ' 已拦'))
  }

  /* 4. 并发取流（同一个 id 同时 5 个请求） */
  console.log('\n[4] 并发取流（同 id × 5）')
  const id = '33911781'
  const t0 = Date.now()
  const rs = await Promise.all([1, 2, 3, 4, 5].map(() => get('/api/url?id=' + id + '&source=wy&quality=320k', 60000)))
  console.log('  耗时 ' + (Date.now() - t0) + 'ms')
  console.log('  状态: ' + rs.map((r) => r.status).join(', '))
  const urls = rs.map((r) => { try { return JSON.parse(r.body).url } catch (e) { return '' } })
  const unique = new Set(urls.filter(Boolean)).size
  console.log('  返回 ' + unique + ' 个不同 URL（1 表示缓存生效，5 表示每次重新取）')

  /* 5. 失败结果是否被缓存 */
  console.log('\n[5] 失败结果缓存')
  const badId = '0000000000'
  const r1 = await get('/api/url?id=' + badId + '&source=wy&quality=320k', 60000)
  const r2 = await get('/api/url?id=' + badId + '&source=wy&quality=320k', 60000)
  console.log('  第1次: ' + r1.status + ' ' + r1.ms + 'ms')
  console.log('  第2次: ' + r2.status + ' ' + r2.ms + 'ms' + (r2.ms < r1.ms * 0.2 ? ' ⚠ 可能缓存了失败结果' : ' ok'))

  /* 6. 缺参数 */
  console.log('\n[6] 缺参数')
  for (const p of ['/api/url', '/api/stream', '/api/lyric?id=1', '/api/pic']) {
    const r = await get(p, 15000)
    console.log('  ' + p.padEnd(24) + ' → ' + r.status + ' ' + (r.body || r.err || '').slice(0, 50))
  }

  /* 7. 非法方法 */
  console.log('\n[7] 方法与内容类型')
  const r7 = await new Promise((resolve) => {
    const q = http.request(BASE + '/api/shutdown', { method: 'GET', timeout: 8000 }, (res) => {
      let d = ''
      res.on('data', (c) => { d += c })
      res.on('end', () => resolve({ status: res.statusCode, body: d }))
    })
    q.on('error', (e) => resolve({ status: 0, err: e.message }))
    q.end()
  })
  console.log('  GET /api/shutdown → ' + r7.status + ' ' + (r7.body || r7.err || '').slice(0, 60))
})()
