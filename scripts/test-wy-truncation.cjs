'use strict'
/* 实测网易云热歌榜：标称时长 vs 实际音频时长
   判断「只放一半」是接口给残缺版，还是前端检测失效 */
const https = require('node:https')

function get (url, headers) {
  return new Promise((resolve) => {
    const u = new URL(url)
    const q = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: Object.assign({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0',
        Referer: 'https://music.163.com/',
      }, headers || {}),
      timeout: 20000,
    }, (res) => {
      /* 只读前 1MB 判断音频时长够用 */
      let total = 0
      const chunks = []
      res.on('data', (c) => {
        chunks.push(c)
        total += c.length
        if (total > 2 * 1024 * 1024) { res.destroy() }
      })
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, size: total, body: Buffer.concat(chunks) }))
      res.on('close', () => resolve({ status: res.statusCode, headers: res.headers, size: total, body: Buffer.concat(chunks) }))
    })
    q.on('error', (e) => resolve({ status: 0, error: e.message }))
    q.on('timeout', () => { q.destroy(); resolve({ status: 0, error: 'timeout' }) })
    q.end()
  })
}

;(async () => {
  /* 热门榜单 */
  const detail = await get('https://music.163.com/api/v6/playlist/detail?id=3778678&n=10')
  let pl = null
  try { pl = JSON.parse(detail.body.toString()).playlist } catch (e) { }
  if (!pl) { console.log('拿不到榜单'); return }

  const tracks = (pl.tracks || []).slice(0, 5)
  console.log('榜单: ' + pl.name + ' | ' + tracks.length + ' 首\n')

  for (const t of tracks) {
    const realMs = t.dt || t.duration || 0
    const realSec = Math.round(realMs / 1000)
    const url = 'https://music.163.com/song/media/outer/url?id=' + t.id + '.mp3'

    const r = await get(url)
    const ct = String(r.headers && r.headers['content-type'] || '')
    const len = Number(r.headers && r.headers['content-length'] || 0)
    const isAudio = ct.includes('audio') || ct.includes('mpeg')
    /* 粗略估算时长：128kbps = 16KB/s, 320kbps = 40KB/s */
    const estSec = len ? Math.round(len / 40000) : 0

    console.log((t.name || '').slice(0, 24).padEnd(26) +
      '标称 ' + String(realSec).padStart(4) + 's | ' +
      'HTTP ' + r.status + ' | ' +
      ct.slice(0, 20).padEnd(21) + ' | ' +
      '长度 ' + (len ? (len / 1048576).toFixed(1) + 'MB' : (r.size / 1024).toFixed(0) + 'KB') + ' | ' +
      (isAudio ? '音频 估' + estSec + 's' : '❌非音频'))
  }
})()
