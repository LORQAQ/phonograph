'use strict'
/* 找可用的酷狗取流接口 */
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
      res.on('end', () => resolve({ status: res.statusCode, body: d, headers: res.headers }))
    })
    q.on('error', (e) => resolve({ status: 0, error: e.message }))
    q.on('timeout', () => { q.destroy(); resolve({ status: 0, error: 'timeout' }) })
    q.end()
  })
}

;(async () => {
  /* 用歌单第一首的 hash + album_id */
  const hash = '5892CE1DAA47106380B3D4F796237B63'
  const albumId = '99263622'
  const audioId = '1090289052'

  const tests = [
    ['play/getdata (无签名)', 'https://wwwapi.kugou.com/yy/index.php?r=play/getdata&hash=' + hash + '&dfid=1&mid=1&platid=4&album_id=' + albumId],
    ['play/getdata (mobile)', 'https://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash=' + hash],
    ['kugou v2', 'https://wwwapi.kugou.com/yy/index.php?r=play/getdata&hash=' + hash + '&album_id=' + albumId + '&dfid=0&mid=0&platid=4&_=1'],
    ['mobi songinfo', 'https://mobiles.kugou.com/api/v3/song/info?songid=' + audioId + '&format=json'],
    ['mobi getSongInfo', 'http://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash=' + hash],
  ]

  for (const [name, url] of tests) {
    const r = await get(url)
    const body = r.body || r.error || ''
    console.log('\n[' + name + '] status=' + r.status + ' len=' + body.length)
    /* 找播放地址 */
    const m = body.match(/"(play_url|url|playUrl|backup_url)"\s*:\s*"([^"]{10,300})"/i)
    if (m) {
      console.log('  ✓ ' + m[1] + ' = ' + m[2].slice(0, 100))
    } else {
      console.log('  无播放地址，前 200 字:')
      console.log('  ' + body.slice(0, 200).replace(/\n/g, ' '))
    }
  }
})()
