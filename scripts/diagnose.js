'use strict'
/* 全面诊断：网络/代理、平台可达性、取流链路、跨平台兜底 */
const http = require('node:http')
const https = require('node:https')

const BASE = 'http://127.0.0.1:37621'

function get (url, timeout = 12000) {
  return new Promise((resolve) => {
    try {
      const u = new URL(url)
      const mod = u.protocol === 'https:' ? https : http
      const req = mod.get(u, { timeout, headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://music.163.com/' } }, (res) => {
        let d = ''
        res.on('data', (c) => { d += c })
        res.on('end', () => resolve({ status: res.statusCode, body: d }))
      })
      req.on('error', (e) => resolve({ status: 0, error: e.message }))
      req.on('timeout', () => { req.destroy(); resolve({ status: 0, error: 'timeout' }) })
    } catch (e) { resolve({ status: 0, error: e.message }) }
  })
}

;(async () => {
  console.log('=== 1. 环境 ===')
  console.log('HTTP_PROXY:', process.env.HTTP_PROXY || process.env.http_proxy || '(无)')
  console.log('HTTPS_PROXY:', process.env.HTTPS_PROXY || process.env.https_proxy || '(无)')
  console.log('NO_PROXY:', process.env.NO_PROXY || process.env.no_proxy || '(无)')

  console.log('\n=== 2. 平台可达性 ===')
  for (const [name, url] of [
    ['网易云 API', 'https://music.163.com/api/search/get/?s=lemon&type=1&limit=1'],
    ['网易云 CDN', 'https://iot102.music.126.net/'],
    ['QQ 音乐 API', 'https://u.y.qq.com/cgi-bin/musicu.fcg'],
    ['酷狗 API', 'http://mobilecdn.kugou.com/api/v3/search/song?keyword=lemon&page=1&pagesize=1'],
  ]) {
    const t0 = Date.now()
    const r = await get(url)
    console.log(`  ${name}: ${r.status || 'ERR'} ${Date.now() - t0}ms ${r.error || ''}`)
  }

  console.log('\n=== 3. 服务健康 ===')
  const h = await get(BASE + '/api/health', 6000)
  console.log('  health:', h.body || h.error)

  console.log('\n=== 4. 取歌单与逐首取流 ===')
  const disc = await get(BASE + '/api/discover?source=wy&offset=0&limit=1', 20000)
  let plId = ''
  try { plId = (JSON.parse(disc.body).playlists || [])[0].id } catch (e) { }
  console.log('  歌单 id:', plId)

  if (plId) {
    const prev = await new Promise((resolve) => {
      const body = JSON.stringify({ action: 'preview', url: 'https://music.163.com/#/playlist?id=' + plId })
      const req = http.request(BASE + '/api/playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout: 30000,
      }, (res) => { let d = ''; res.on('data', (c) => { d += c }); res.on('end', () => resolve(d)) })
      req.on('error', () => resolve('{}'))
      req.write(body)
      req.end()
    })
    let songs = []
    try { songs = (JSON.parse(prev).songs || []).slice(0, 6) } catch (e) { }

    for (const s of songs) {
      const qs = `/api/url?id=${encodeURIComponent(s.id)}&source=wy&quality=320k&name=${encodeURIComponent(s.name || '')}&singer=${encodeURIComponent(s.singer || '')}`
      const t0 = Date.now()
      const r = await get(BASE + qs, 45000)
      let info = {}
      try { info = JSON.parse(r.body) } catch (e) { }
      const ok = info.url ? '✓' : '✗'
      console.log(`  ${ok} ${String(s.name).slice(0, 18).padEnd(20)} ${Date.now() - t0}ms ${info.provider || info.error || ''}`)
    }
  }
})()
