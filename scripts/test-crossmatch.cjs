'use strict'
/* 验证跨平台兜底的误匹配问题 */
const http = require('node:http')

const BASE = 'http://127.0.0.1:37621'

function get (path, timeout = 60000) {
  return new Promise((resolve) => {
    const q = http.get(BASE + path, { timeout }, (res) => {
      let d = ''
      res.on('data', (c) => { d += c })
      res.on('end', () => resolve({ status: res.statusCode, body: d }))
    })
    q.on('error', (e) => resolve({ status: 0, err: e.message }))
    q.on('timeout', () => { q.destroy(); resolve({ status: 0, err: 'timeout' }) })
  })
}

;(async () => {
  console.log('=== 误匹配验证 ===\n')

  /* 1. 假 id + 真歌名（应该搜到正确的歌） */
  const cases = [
    ['真 id + 真歌名', '33911781', 'secret base', '茅野愛衣'],
    ['假 id + 真歌名', '0000000000', 'secret base', '茅野愛衣'],
    ['假 id + 空歌名', '0000000000', '', ''],
    ['假 id + 乱码歌名', '0000000000', 'zzzzzzzzzzzz', 'yyyyyyyy'],
    ['假 id + 短歌名', '111', 'a', 'b'],
  ]

  for (const [label, id, name, singer] of cases) {
    const qs = new URLSearchParams({ id, source: 'wy', quality: '320k', name, singer })
    const r = await get('/api/url?' + qs.toString())
    let j = null
    try { j = JSON.parse(r.body) } catch (e) { }
    const url = j && j.url ? String(j.url) : ''
    const prov = j && j.provider ? j.provider : ''
    const cross = j && j.crossPlatform ? j.crossPlatform : ''
    console.log('[' + label + ']')
    console.log('  status=' + r.status + ' provider=' + prov + (cross ? ' cross=' + cross : ''))
    if (url) console.log('  url=' + url.slice(0, 70))
    if (!url && r.body) console.log('  body=' + r.body.slice(0, 100))
    console.log('')
  }

  /* 2. 并发缓存：连发 3 个相同请求，看 provider 是否一致 */
  console.log('=== 并发缓存一致性 ===')
  const qs = 'id=33911781&source=wy&quality=320k'
  const rs = await Promise.all([1, 2, 3].map(() => get('/api/url?' + qs)))
  rs.forEach((r, i) => {
    let j = null
    try { j = JSON.parse(r.body) } catch (e) { }
    console.log('  #' + (i + 1) + ' status=' + r.status + ' provider=' + (j && j.provider || '?') + ' cached=' + (j && j.cached || false))
  })
})()
