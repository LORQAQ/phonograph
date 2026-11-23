'use strict'
/* 测：同一个网易云歌曲，不同 quality 参数下 /api/url 返回的 quality 和 URL */
const http = require('node:http')
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

const BASE = 'http://127.0.0.1:37621'
function get (p, timeout) {
  return new Promise((r) => {
    const q = http.request(BASE + p, { timeout: timeout || 90000 }, (x) => {
      let s = ''
      x.on('data', (c) => { s += c })
      x.on('end', () => { let j = null; try { j = JSON.parse(s) } catch (e) { } r({ st: x.statusCode, body: s, j }) })
    })
    q.on('error', (e) => r({ st: 0, err: e.message }))
    q.on('timeout', () => { q.destroy(); r({ st: 0, err: 'timeout' }) })
    q.end()
  })
}

;(async () => {
  /* 拿一首网易云的歌 */
  const top = await get('/api/toplist?type=hot&source=wy', 60000)
  let list = []
  try { list = JSON.parse(top.body).list || [] } catch (e) { }
  if (!list.length) { console.log('拿不到榜单'); process.exit(1) }
  const s = list[0]
  console.log('测试歌曲: ' + s.name + ' - ' + s.singer + '  id=' + s.id + '\n')

  const QUALITIES = ['128k', '320k', 'flac', 'flac24bit']
  for (const q of QUALITIES) {
    const r = await get('/api/url?id=' + encodeURIComponent(s.id) + '&source=wy&quality=' + q + '&force=1')
    const j = r.j || {}
    const url = String(j.url || '')
    console.log('请求 ' + q.padEnd(10) + ' → status=' + r.st +
      '  返回 quality=' + String(j.quality || '(空)').padEnd(10) +
      '  provider=' + String(j.provider || '-').padEnd(14) +
      '  url尾=' + url.slice(-40))
  }

  console.log('\n=== 再测 /api/sources/test（前端「测速当前歌曲」用的）===')
  const t = await get('/api/sources/test?id=' + encodeURIComponent(s.id) + '&source=wy', 60000)
  console.log('  status=' + t.st)
  if (t.j && t.j.list) {
    t.j.list.forEach((x) => console.log('  ' + String(x.name).padEnd(20) + ' ok=' + x.ok + '  quality=' + (x.quality || '-') + '  ms=' + x.ms))
  } else {
    console.log('  ' + String(t.body).slice(0, 200))
  }
})()