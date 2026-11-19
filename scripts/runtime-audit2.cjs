'use strict'
/* 补充运行时审查：资源、并发、边界 */
const http = require('node:http')

const BASE = 'http://127.0.0.1:37621'

function get (path, timeout = 30000) {
  return new Promise((resolve) => {
    const t0 = Date.now()
    const q = http.get(BASE + path, { timeout }, (res) => {
      let n = 0
      res.on('data', (c) => { n += c.length })
      res.on('end', () => resolve({ status: res.statusCode, size: n, ms: Date.now() - t0, ct: res.headers['content-type'] || '' }))
    })
    q.on('error', (e) => resolve({ status: 0, err: e.message, ms: Date.now() - t0 }))
    q.on('timeout', () => { q.destroy(); resolve({ status: 0, err: 'timeout', ms: Date.now() - t0 }) })
  })
}

function post (path, body, timeout = 30000) {
  return new Promise((resolve) => {
    const data = body == null ? null : (typeof body === 'string' ? body : JSON.stringify(body))
    const q = http.request(BASE + path, {
      method: 'POST',
      timeout,
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {},
    }, (res) => {
      let d = ''
      res.on('data', (c) => { d += c })
      res.on('end', () => resolve({ status: res.statusCode, body: d }))
    })
    q.on('error', (e) => resolve({ status: 0, err: e.message }))
    q.on('timeout', () => { q.destroy(); resolve({ status: 0, err: 'timeout' }) })
    if (data) q.write(data)
    q.end()
  })
}

;(async () => {
  console.log('=== A. /api/stream 大文件与 Range ===')
  const s1 = await get('/api/stream?id=33911781&source=wy&quality=320k', 90000)
  console.log('  全量: status=' + s1.status + ' ' + (s1.size / 1048576).toFixed(1) + 'MB ' + s1.ms + 'ms ct=' + s1.ct)
  console.log('  ' + (s1.ms > 20000 ? '⚠ 全量下载耗时长（前端播放需等这么久）' : 'ok 流式'))

  /* Range 请求 */
  const r = await new Promise((resolve) => {
    const q = http.get(BASE + '/api/stream?id=33911781&source=wy&quality=320k', {
      timeout: 30000,
      headers: { Range: 'bytes=0-1023' },
    }, (res) => {
      let n = 0
      res.on('data', (c) => { n += c.length })
      res.on('end', () => resolve({ status: res.statusCode, size: n, cr: res.headers['content-range'] || '', ar: res.headers['accept-ranges'] || '' }))
    })
    q.on('error', (e) => resolve({ status: 0, err: e.message }))
    q.end()
  })
  console.log('  Range bytes=0-1023: status=' + r.status + ' size=' + r.size + ' content-range=' + (r.cr || '无') + ' accept-ranges=' + (r.ar || '无'))
  console.log('  ' + (r.status === 206 ? 'ok 支持分片' : '⚠ 不支持 Range（拖动进度条会重新下载全部）'))

  console.log('\n=== B. 大请求体 ===')
  const big = 'x'.repeat(10 * 1024 * 1024)
  const bp = await post('/api/playlist', { action: 'create', name: big })
  console.log('  10MB name 字段: status=' + bp.status + ' ' + (bp.body || bp.err || '').slice(0, 60))

  console.log('\n=== C. 畸形 JSON ===')
  for (const b of ['{', 'null', '[]', '"str"', '{"action":123}']) {
    const mp = await post('/api/playlist', b)
    console.log('  body=' + JSON.stringify(b).padEnd(18) + ' → ' + mp.status + ' ' + (mp.body || mp.err || '').slice(0, 55))
  }

  console.log('\n=== D. 歌单接口字段兼容 ===')
  const c1 = await post('/api/playlist', { action: 'create', name: 'T1' })
  let plId = ''
  try { plId = JSON.parse(c1.body).playlist.id } catch (e) { }
  console.log('  创建: ' + c1.status + ' id=' + plId)
  if (plId) {
    const a1 = await post('/api/playlist', { action: 'add', id: plId, song: { id: '1', name: 'A', source: 'wy' } })
    console.log('  用 id 加歌: ' + a1.status)
    const a2 = await post('/api/playlist', { action: 'add', listId: plId, song: { id: '2', name: 'B', source: 'wy' } })
    console.log('  用 listId 加歌: ' + a2.status)
    const a3 = await post('/api/playlist', { action: 'remove', listId: plId, songId: '1' })
    console.log('  移除: ' + a3.status)
    const a4 = await post('/api/playlist', { action: 'add', listId: 'nope', song: { id: '3' } })
    console.log('  不存在的歌单: ' + a4.status + ' ' + (a4.body || '').slice(0, 50))
    await post('/api/playlist', { action: 'delete', id: plId })
  }

  console.log('\n=== E. 音源接口 ===')
  const ss = await get('/api/sources')
  let srcCount = 0
  try { srcCount = (JSON.parse(ss.body).list || []).length } catch (e) { }
  console.log('  /api/sources: ' + ss.status + ' ' + srcCount + ' 个音源')

  console.log('\n=== F. 设置接口 ===')
  const st = await get('/api/settings')
  console.log('  get: ' + st.status + ' ' + (st.body || '').slice(0, 80))
  const badDir = await get('/api/download-dir?set=' + encodeURIComponent('C:\\Windows\\System32'))
  console.log('  set 系统目录: ' + badDir.status + ' ' + (badDir.body || '').slice(0, 100))
})()
