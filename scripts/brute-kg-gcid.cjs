'use strict'
/* 穷举酷狗 gcid 歌单接口 */
const https = require('node:https')

function get (url, headers) {
  return new Promise((resolve) => {
    let u
    try { u = new URL(url) } catch (e) { resolve({ status: 0, body: 'badurl' }); return }
    const q = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: Object.assign({
        'User-Agent': 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36',
        Referer: 'https://m.kugou.com/',
        Accept: 'application/json',
      }, headers || {}),
      timeout: 15000,
      rejectUnauthorized: false,
    }, (res) => {
      let d = ''
      res.on('data', (c) => { d += c })
      res.on('end', () => resolve({ status: res.statusCode, body: d }))
    })
    q.on('error', (e) => resolve({ status: 0, body: 'ERR:' + e.message }))
    q.on('timeout', () => { q.destroy(); resolve({ status: 0, body: 'timeout' }) })
    q.end()
  })
}

;(async () => {
  const gcid = 'gcid_3znx57dpz2tz0b7'
  const raw = '3znx57dpz2tz0b7'

  const tests = [
    ['v3/special/song gcid', 'https://mobilecdn.kugou.com/api/v3/special/song?specialid=' + gcid + '&page=1&pagesize=5&format=json'],
    ['v3/songlist gcid', 'https://mobiles.kugou.com/api/v3/songlist/list?gcid=' + gcid + '&page=1&pagesize=5&format=json'],
    ['v3/songlist raw', 'https://mobiles.kugou.com/api/v3/songlist/list?gcid=' + raw + '&page=1&pagesize=5&format=json'],
    ['v3/special raw', 'https://mobilecdn.kugou.com/api/v3/special/song?specialid=' + raw + '&page=1&pagesize=5&format=json'],
    ['v3/gcidspecial', 'https://mobiles.kugou.com/api/v3/gcidspecial/info?gcid=' + gcid + '&format=json'],
    ['v3/plinfo gcid', 'https://mobilecdn.kugou.com/api/v3/plinfo/info?gcid=' + gcid + '&format=json'],
    ['wwwapi songlist', 'https://wwwapi.kugou.com/yy/index.php?r=songlist/list&gcid=' + gcid + '&page=1&pagesize=5'],
    ['wwwapi plist', 'https://wwwapi.kugou.com/yy/index.php?r=plist/list&gcid=' + gcid + '&page=1&pagesize=5'],
    ['m.kugou plist json', 'https://m.kugou.com/plist/list/' + gcid + '?json=true&page=1&pagesize=5'],
    ['m.kugou songlist json', 'https://m.kugou.com/songlist/' + gcid + '/?json=true&page=1&pagesize=5'],
    ['kugou v2 songlist', 'https://mobiles.kugou.com/api/v3/songlist/song?gcid=' + gcid + '&page=1&pagesize=5&format=json'],
    ['gateway', 'https://gateway.kugou.com/v2/get_res_privilege/lite?appid=1005&clientver=11520&clienttime=1&mid=1&uuid=1&dfid=1&platid=4&resource=' + encodeURIComponent('[{"type":1,"page":1,"pagesize":5,"gcid":"' + gcid + '"}]')],
  ]

  for (const [name, url] of tests) {
    const r = await get(url)
    const body = r.body || ''
    const looksJson = body.trim().startsWith('{') || body.trim().startsWith('[')
    const hasArr = /"(info|songs|list|data)"\s*:\s*\[/.test(body)
    console.log('[' + name.padEnd(22) + '] ' + r.status + ' len=' + String(body.length).padStart(6) + (looksJson ? ' JSON' : ' HTML') + (hasArr ? ' ✓有数组' : ''))
    if (looksJson && body.length > 30 && body.length < 400) {
      console.log('   ' + body.slice(0, 160).replace(/\n/g, ' '))
    } else if (looksJson && hasArr) {
      console.log('   ' + body.slice(0, 200).replace(/\n/g, ' '))
    }
  }
})()
