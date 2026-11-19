'use strict'
/* 测两种歌单链接：QQ 的 ?id= 与酷狗的 gcid_ */
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
      timeout: 20000,
      rejectUnauthorized: false,
    }, (res) => {
      let d = ''
      res.on('data', (c) => { d += c })
      res.on('end', () => resolve({ status: res.statusCode, body: d, loc: res.headers.location }))
    })
    q.on('error', (e) => resolve({ status: 0, error: e.message }))
    q.on('timeout', () => { q.destroy(); resolve({ status: 0, error: 'timeout' }) })
    q.end()
  })
}

;(async () => {
  console.log('=== 1. QQ 歌单 ?id=7799808010 ===')
  const qqUrl = 'https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0&disstid=7799808010&format=json&g_tk=5381&loginUin=0&hostUin=0&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=0'
  const r1 = await get(qqUrl, { Referer: 'https://y.qq.com/' })
  console.log('  status=' + r1.status + ' len=' + r1.body.length)
  try {
    const j = JSON.parse(r1.body)
    const cd = j && j.cdlist && j.cdlist[0]
    if (cd) {
      console.log('  ✓ 歌单: ' + cd.dissname + ' | ' + (cd.songlist || []).length + ' 首')
      const s = (cd.songlist || [])[0]
      if (s) console.log('  第一首: ' + s.songname + ' - ' + (s.singer || []).map((x) => x.name).join('/'))
    } else {
      console.log('  ✗ 无 cdlist，前 150 字: ' + r1.body.slice(0, 150))
    }
  } catch (e) {
    console.log('  ✗ 解析失败，前 150 字: ' + r1.body.slice(0, 150))
  }

  console.log('\n=== 2. 酷狗 gcid_3znx57dpz2tz0b7 ===')
  const gcid = '3znx57dpz2tz0b7'
  const kgTests = [
    ['gcidspecial', 'https://m.kugou.com/plist/list/gcid_' + gcid + '?json=true&page=1&pagesize=5'],
    ['songlist page', 'https://m.kugou.com/songlist/gcid_' + gcid + '/?json=true'],
    ['mobilecdn gcid', 'https://mobilecdn.kugou.com/api/v3/special/song?specialid=gcid_' + gcid + '&page=1&pagesize=5&format=json'],
    ['mobi m3', 'https://mobilecdn.kugou.com/api/v3/songlist/list?gcid=gcid_' + gcid + '&page=1&pagesize=5&format=json'],
    ['mobi pl', 'https://mobilecdn.kugou.com/api/v3/plist/list?gcid=gcid_' + gcid + '&page=1&pagesize=5&format=json'],
    ['kugou special', 'https://wwwapi.kugou.com/yy/special/single/gcid_' + gcid + '.json?page=1&pagesize=5'],
    ['mobile gcid', 'https://mobilecdn.kugou.com/api/v3/gcidspecial/info?gcid=gcid_' + gcid + '&format=json'],
  ]
  for (const [name, url] of kgTests) {
    const r = await get(url)
    const body = r.body || r.error || ''
    const hasSongs = /"(info|songs|list)"\s*:\s*\[/.test(body)
    console.log('  [' + name + '] status=' + r.status + ' len=' + body.length + (hasSongs ? ' ✓有歌曲数组' : ''))
    if (r.status === 200 && body.length > 100) {
      console.log('    ' + body.slice(0, 130).replace(/\n/g, ' '))
    }
  }
})()
