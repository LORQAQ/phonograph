'use strict'
/* 跟随 302 看网易云外链的真实音频大小 → 判断是否残缺 */
const https = require('node:https')

function fetchHead (url, headers, depth = 0) {
  return new Promise((resolve) => {
    if (depth > 4) { resolve({ status: 0, error: 'too many redirects' }); return }
    const u = new URL(url)
    const q = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'GET',
      headers: Object.assign({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0',
        Referer: 'https://music.163.com/',
      }, headers || {}),
      timeout: 20000,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.destroy()
        const next = new URL(res.headers.location, url).toString()
        fetchHead(next, headers, depth + 1).then(resolve)
        return
      }
      let total = 0
      res.on('data', (c) => {
        total += c.length
        if (total > 300 * 1024) { res.destroy() }
      })
      const done = () => resolve({
        status: res.statusCode,
        ct: String(res.headers['content-type'] || ''),
        len: Number(res.headers['content-length'] || 0),
        finalUrl: url,
        read: total,
      })
      res.on('end', done)
      res.on('close', done)
    })
    q.on('error', (e) => resolve({ status: 0, error: e.message }))
    q.on('timeout', () => { q.destroy(); resolve({ status: 0, error: 'timeout' }) })
    q.end()
  })
}

;(async () => {
  const { execSync } = require('node:child_process')
  /* 拿榜单 */
  const raw = await new Promise((resolve) => {
    https.get({
      hostname: 'music.163.com',
      path: '/api/v6/playlist/detail?id=3778678&n=10',
      headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://music.163.com/' },
      timeout: 20000,
    }, (res) => {
      let d = ''
      res.on('data', (c) => { d += c })
      res.on('end', () => resolve(d))
    })
  })

  let pl = null
  try { pl = JSON.parse(raw).playlist } catch (e) { }
  if (!pl) { console.log('拿不到榜单'); return }

  const tracks = (pl.tracks || []).slice(0, 6)
  console.log('榜单: ' + pl.name + '\n')
  console.log('歌名'.padEnd(22) + '标称   真实音频大小   估算时长   判定')
  console.log('-'.repeat(78))

  for (const t of tracks) {
    const realSec = Math.round((t.dt || t.duration || 0) / 1000)
    const r = await fetchHead('https://music.163.com/song/media/outer/url?id=' + t.id + '.mp3')

    /* 用 FFmpeg 探测真实时长更准，但先用大小估 */
    const mb = r.len / 1048576
    /* 320kbps ≈ 40KB/s，128kbps ≈ 16KB/s，取中间 28KB/s */
    const estSec128 = r.len / 16000
    const estSec320 = r.len / 40000

    let verdict = '?'
    if (!r.len) verdict = '无长度'
    else if (r.ct.includes('html')) verdict = '❌HTML'
    else if (estSec128 < realSec * 0.5) verdict = '❌严重残缺'
    else if (estSec320 < realSec * 0.75 && estSec128 < realSec * 0.95) verdict = '⚠可能残缺'
    else verdict = '✓完整'

    console.log(
      (t.name || '').slice(0, 20).padEnd(22) +
      String(realSec).padStart(4) + 's  ' +
      (mb ? mb.toFixed(2) + 'MB' : '0').padStart(11) + '  ' +
      (estSec128 > 0 ? Math.round(estSec128) + '~' + Math.round(estSec320) + 's' : '-').padStart(9) + '  ' +
      verdict
    )
  }
})()
