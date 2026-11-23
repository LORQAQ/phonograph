'use strict'
/* 针对某一首歌，把所有音质 × 是否只用本平台 都试一遍，看有没有完整版 */
const http = require('node:http')
const https = require('node:https')
const path = require('node:path')
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
function probe (url) {
  return new Promise((r) => {
    let u
    try { u = new URL(url) } catch (e) { return r(null) }
    const mod = u.protocol === 'https:' ? https : http
    const req = mod.request({
      hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: 'GET',
      headers: { Range: 'bytes=0-1', 'User-Agent': 'Mozilla/5.0 Chrome/126.0.0.0', Referer: 'https://music.163.com/' },
      timeout: 12000, rejectUnauthorized: false,
    }, (res) => {
      const cr = res.headers['content-range']
      const cl = res.headers['content-length']
      let total = null
      if (cr) { const m = String(cr).match(/\/(\d+)/); if (m) total = Number(m[1]) } else if (cl) total = Number(cl)
      res.resume()
      r({ total })
    })
    req.on('timeout', () => { try { req.destroy() } catch (e) { } r(null) })
    req.on('error', () => r(null))
    req.end()
  })
}
const fmt = (s) => (!isFinite(s) || s <= 0 ? '?' : Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0'))
const br = (q) => (q === 'flac' || q === 'flac24bit' ? 900000 : q === '320k' ? 320000 : 128000)

;(async () => {
  const top = await get('/api/toplist?type=hot&source=wy', 60000)
  let list = []
  try { list = JSON.parse(top.body).list || [] } catch (e) { }
  /* 找 time machine */
  const s = list.find((x) => /time machine/i.test(x.name)) || list[1]
  const metaSec = (Number(s.duration) || 0) / 1000
  console.log('歌曲: ' + s.name + '  元数据=' + fmt(metaSec) + '  id=' + s.id + '\n')

  const CASES = [
    ['flac24bit', ''], ['flac', ''], ['320k', ''], ['128k', ''],
    ['flac24bit', 'fish'], ['flac24bit', 'kxh'], ['flac24bit', 'dujia6'],
    ['flac24bit', 'yuxi'], ['flac24bit', 'changqing2'], ['flac24bit', 'freelisten'],
  ]
  console.log('音质        指定源        结果')
  console.log('-'.repeat(72))
  for (const [q, only] of CASES) {
    const qs = 'id=' + encodeURIComponent(s.id) + '&source=wy&quality=' + q + '&force=1' + (only ? '&only=' + only : '')
    const r = await get('/api/url?' + qs)
    const j = r.j || {}
    if (!j.url) {
      console.log(q.padEnd(12) + (only || '全部').padEnd(14) + '✗ 无地址  ' + String(r.body).slice(0, 60).replace(/\n/g, ' '))
      continue
    }
    const sz = await probe(j.url)
    const est = sz && sz.total ? (sz.total * 8) / br(j.quality) : 0
    console.log(q.padEnd(12) + (only || '全部').padEnd(14) + fmt(est) + '  [' + j.quality + '] ' + j.provider)
  }
})()