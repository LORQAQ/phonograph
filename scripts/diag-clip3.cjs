'use strict'
/* 广泛扫描：找出实际音频时长很短（试听片段）的歌 */
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
      r({ total, type: String(res.headers['content-type'] || '') })
    })
    req.on('timeout', () => { try { req.destroy() } catch (e) { } r(null) })
    req.on('error', () => r(null))
    req.end()
  })
}

function fmt (s) {
  if (!isFinite(s) || s <= 0) return '?'
  return Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0')
}

function bitrateOf (quality, type) {
  if (quality === 'flac' || quality === 'flac24bit') return 900000
  if (quality === '320k') return 320000
  if (quality === '128k') return 128000
  return 320000
}

;(async () => {
  const top = await get('/api/toplist?type=hot&source=wy', 60000)
  let list = []
  try { list = JSON.parse(top.body).list || [] } catch (e) { }
  if (!list.length) { console.log('拿不到榜单'); process.exit(1) }

  const QUAL = process.argv[2] || 'flac24bit'
  const songs = list.slice(0, 12)
  console.log('扫描 ' + songs.length + ' 首  音质=' + QUAL + '\n')
  console.log('歌曲'.padEnd(26) + '元数据  实际    判定   来源')
  console.log('-'.repeat(78))

  const clips = []
  for (const s of songs) {
    const metaSec = (Number(s.duration) || 0) / 1000
    const r = await get('/api/url?id=' + encodeURIComponent(s.id) + '&source=wy&quality=' + QUAL + '&force=1')
    const j = r.j || {}
    const name = String(s.name).slice(0, 24).padEnd(26)
    if (!j.url) { console.log(name + fmt(metaSec).padEnd(8) + '—       无地址（无源能给完整版）'); continue }

    const sz = await probe(j.url)
    if (!sz || !sz.total) { console.log(name + fmt(metaSec).padEnd(8) + '?      未知   ' + j.provider); continue }
    const est = (sz.total * 8) / bitrateOf(j.quality, sz.type)
    const short = est < 40
    const verdict = short ? '⚠ 片段' : (metaSec && est / metaSec < 0.8 ? '⚠ 偏短' : '✓ 完整')
    if (verdict !== '✓ 完整') clips.push(s.name + ' (' + fmt(est) + '/' + fmt(metaSec) + ')')
    console.log(name + fmt(metaSec).padEnd(8) + fmt(est).padEnd(8) + verdict + '   ' + j.quality + ' ' + j.provider)
  }

  console.log('\n' + (clips.length ? '⚠ 有问题的 ' + clips.length + ' 首:\n  ' + clips.join('\n  ') : '✓ 全部完整'))
})()