'use strict'
/* 多首歌对比：元数据时长 vs 实际音频时长，找出「试听片段」 */
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

function sizeOf (url) {
  return new Promise((r) => {
    let u
    try { u = new URL(url) } catch (e) { return r(null) }
    const mod = u.protocol === 'https:' ? https : http
    const req = mod.request({
      hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: 'GET',
      headers: {
        Range: 'bytes=0-1',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
        Referer: 'https://music.163.com/',
      },
      timeout: 15000, rejectUnauthorized: false,
    }, (res) => {
      const cr = res.headers['content-range']
      const cl = res.headers['content-length']
      let total = null
      if (cr) { const m = String(cr).match(/\/(\d+)/); if (m) total = Number(m[1]) } else if (cl) total = Number(cl)
      res.resume()
      r({ status: res.statusCode, total })
    })
    req.on('timeout', () => { try { req.destroy() } catch (e) { } r(null) })
    req.on('error', () => r(null))
    req.end()
  })
}

function fmt (sec) {
  if (!isFinite(sec) || sec <= 0) return '?'
  return Math.floor(sec / 60) + ':' + String(Math.round(sec % 60)).padStart(2, '0')
}

;(async () => {
  const top = await get('/api/toplist?type=hot&source=wy', 60000)
  let list = []
  try { list = JSON.parse(top.body).list || [] } catch (e) { }
  if (!list.length) { console.log('拿不到榜单'); process.exit(1) }

  const songs = list.slice(0, 5)
  console.log('对比：元数据时长 vs 实际文件估算时长（320k 档）\n')
  console.log('歌曲'.padEnd(28) + 'VIP  元数据   实际    判定')
  console.log('-'.repeat(70))

  let bad = 0
  for (const s of songs) {
    const metaSec = (Number(s.duration) || 0) / 1000
    const r = await get('/api/url?id=' + encodeURIComponent(s.id) + '&source=wy&quality=320k&force=1')
    const j = r.j || {}
    let line = String(s.name).slice(0, 26).padEnd(28) + (s.fee === 1 ? 'VIP  ' : '     ') + fmt(metaSec).padEnd(9)

    if (!j.url) {
      console.log(line + '  —      取流失败')
      continue
    }
    const sz = await sizeOf(j.url)
    if (!sz || !sz.total) {
      console.log(line + '  ?      大小未知')
      continue
    }
    /* 320k mp3: 每秒 40000 字节 */
    const estSec = (sz.total * 8) / 320000
    const ratio = metaSec > 0 ? estSec / metaSec : 0
    const verdict = ratio < 0.5
      ? '⚠ 片段(' + Math.round(ratio * 100) + '%)'
      : '✓ 完整'
    if (ratio < 0.5) bad++
    console.log(line + fmt(estSec).padEnd(8) + verdict + '   [' + j.provider + ']')
  }

  console.log('\n' + (bad ? '⚠ 发现 ' + bad + ' 首是片段' : '✓ 这 5 首都是完整版'))
})()