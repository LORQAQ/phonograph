'use strict'
/* 测试酷狗歌单接口（Node，带完整 headers） */
const https = require('node:https')

function get (url, headers) {
  return new Promise((resolve) => {
    const u = new URL(url)
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'GET',
      headers: Object.assign({
        'User-Agent': 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36',
        Referer: 'https://m.kugou.com/',
        Accept: 'application/json, text/plain, */*',
      }, headers || {}),
      timeout: 15000,
      rejectUnauthorized: false,
    }, (res) => {
      let d = ''
      res.on('data', (c) => { d += c })
      res.on('end', () => resolve({ status: res.statusCode, body: d }))
    })
    req.on('error', (e) => resolve({ status: 0, error: e.message }))
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, error: 'timeout' }) })
    req.end()
  })
}

;(async () => {
  const tests = [
    ['mobilecdn song', 'https://mobilecdn.kugou.com/api/v3/special/song?specialid=1018146&page=1&pagesize=5&format=json'],
    ['mobilecdn info', 'https://mobilecdn.kugou.com/api/v3/special/info?specialid=1018146&format=json'],
    ['wwwapi single', 'https://wwwapi.kugou.com/yy/special/single/1018146.json?page=1&pagesize=5&type=0'],
    ['m plist', 'https://m.kugou.com/plist/list/1018146?json=true&page=1&pagesize=5'],
  ]
  for (const [name, url] of tests) {
    const r = await get(url)
    const preview = (r.body || r.error || '').slice(0, 200).replace(/\n/g, ' ')
    console.log('[' + name + '] status=' + r.status + ' len=' + (r.body || '').length)
    console.log('  ' + preview)
    console.log('')
  }
})()
