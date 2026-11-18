'use strict'
/* 找酷狗真实专辑封面接口（stdmusic 那个是默认占位图） */
const https = require('node:https')

function get (url, headers) {
  return new Promise((resolve) => {
    const u = new URL(url)
    const q = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: Object.assign({
        'User-Agent': 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36',
        Referer: 'https://m.kugou.com/',
      }, headers || {}),
      timeout: 15000,
      rejectUnauthorized: false,
    }, (res) => {
      let d = ''
      res.on('data', (c) => { d += c })
      res.on('end', () => resolve({ status: res.statusCode, body: d }))
    })
    q.on('error', (e) => resolve({ status: 0, error: e.message }))
    q.on('timeout', () => { q.destroy(); resolve({ status: 0, error: 'timeout' }) })
    q.end()
  })
}

;(async () => {
  const hash = '5892CE1DAA47106380B3D4F796237B63'

  const tests = [
    ['song/detail', 'https://mobilecdn.kugou.com/api/v3/song/detail?hash=' + hash + '&format=json'],
    ['play/getdata', 'https://wwwapi.kugou.com/yy/index.php?r=play/getdata&hash=' + hash + '&dfid=1&mid=1&platid=4'],
    ['search', 'https://mobilecdn.kugou.com/api/v3/search/song?keyword=%E6%97%B6%E9%97%B4%E7%85%AE%E9%9B%A8&page=1&pagesize=1&format=json'],
  ]

  for (const [name, url] of tests) {
    const r = await get(url)
    console.log('\n[' + name + '] status=' + r.status + ' len=' + (r.body || '').length)
    try {
      const j = JSON.parse(r.body)
      const str = JSON.stringify(j)
      /* 找含图片的字段 */
      const imgMatches = [...str.matchAll(/"(img|image|cover|albumpic|album_img|pic)"\s*:\s*"([^"]{10,200})"/gi)]
      if (imgMatches.length) {
        console.log('  图片字段:')
        imgMatches.slice(0, 3).forEach((m) => console.log('    ' + m[1] + ' = ' + m[2].slice(0, 90)))
      } else {
        console.log('  无图片字段，前 200 字: ' + str.slice(0, 200))
      }
    } catch (e) {
      console.log('  非 JSON: ' + (r.body || r.error || '').slice(0, 120))
    }
  }
})()
