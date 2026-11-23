'use strict'
/* 量各档音质返回的音频到底多大 —— 判断是不是试听片段 */
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

/* 只取前 1 字节，拿 Content-Range / Content-Length 判断总大小 */
function sizeOf (url, referer) {
  return new Promise((r) => {
    let u
    try { u = new URL(url) } catch (e) { return r(null) }
    const mod = u.protocol === 'https:' ? https : http
    const req = mod.request({
      hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: 'GET',
      headers: Object.assign({
        Range: 'bytes=0-1',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
      }, referer ? { Referer: referer } : {}),
      timeout: 15000, rejectUnauthorized: false,
    }, (res) => {
      const cr = res.headers['content-range']
      const cl = res.headers['content-length']
      let total = null
      if (cr) {
        const m = String(cr).match(/\/(\d+)/)
        if (m) total = Number(m[1])
      } else if (cl) {
        total = Number(cl)
      }
      res.resume()
      r({ status: res.statusCode, total, type: res.headers['content-type'] || '' })
    })
    req.on('timeout', () => { try { req.destroy() } catch (e) { } r(null) })
    req.on('error', () => r(null))
    req.end()
  })
}

function fmtDur (sec) {
  if (!isFinite(sec) || sec <= 0) return '?'
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return m + ':' + String(s).padStart(2, '0')
}

;(async () => {
  const top = await get('/api/toplist?type=hot&source=wy', 60000)
  let list = []
  try { list = JSON.parse(top.body).list || [] } catch (e) { }
  if (!list.length) { console.log('拿不到榜单'); process.exit(1) }

  const s = list[0]
  console.log('测试歌曲: ' + s.name + ' - ' + s.singer)
  console.log('歌曲时长（元数据）: ' + s.durationText + '\n')

  const CASES = ['128k', '320k', 'flac', 'flac24bit']
  for (const q of CASES) {
    const r = await get('/api/url?id=' + encodeURIComponent(s.id) + '&source=wy&quality=' + q + '&force=1')
    const j = r.j || {}
    if (!j.url) { console.log(q.padEnd(10) + ' → 无地址  ' + String(r.body).slice(0, 80)); continue }

    const sz = await sizeOf(j.url, 'https://music.163.com/')
    let est = '?'
    let verdict = ''
    if (sz && sz.total) {
      const br = j.quality === 'flac' || j.quality === 'flac24bit' ? 900000
        : j.quality === '320k' ? 320000 : 128000
      const sec = (sz.total * 8) / br
      est = fmtDur(sec)
      verdict = sec < 60 ? '  ⚠ 疑似试听片段' : '  ✓ 完整'
      console.log(q.padEnd(10) + ' → ' + String(j.quality).padEnd(10) +
        String(j.provider).padEnd(14) +
        '大小=' + (sz.total / 1048576).toFixed(2) + 'MB' +
        '  估算时长≈' + est + verdict)
    } else {
      console.log(q.padEnd(10) + ' → ' + String(j.quality).padEnd(10) +
        String(j.provider).padEnd(14) + '大小未知 (status=' + (sz && sz.status) + ')')
    }
  }
})()