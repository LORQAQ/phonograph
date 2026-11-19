'use strict'
/* Audit: single-shot live probe (no retry) -- decode gcid then info_v2 + song_v2 page1 */
const https = require('node:https')
const http = require('node:http')
const crypto = require('node:crypto')
const WEB_KEY = 'NVPh5oo715z5DIWAeQlhMDsWXXQV4hwt'
const AND_KEY = 'OIlwieks28dk2k092lksi2UIkp'
const md5 = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex')
const sign = (params, key, body = '') => md5(key + String(params).split('&').sort().join('') + body + key)

function get (url, opts = {}) {
  return new Promise((resolve) => {
    const u = new URL(url)
    const lib = u.protocol === 'https:' ? https : http
    const body = opts.body ? Buffer.from(opts.body) : null
    const r = lib.request({
      hostname: u.hostname, path: u.pathname + u.search, method: opts.method || 'GET',
      headers: Object.assign({ 'User-Agent': opts.ua || 'Mozilla/5.0 (iPhone; CPU iPhone OS 11_0 like Mac OS X) AppleWebKit/604.1.38 Mobile Safari/604.1' },
        body ? { 'Content-Type': 'application/json', 'Content-Length': body.length } : {}, opts.headers || {}),
      timeout: 15000, rejectUnauthorized: true,
    }, (res) => {
      let d = ''
      res.on('data', (c) => { d += c })
      res.on('end', () => resolve({ status: res.statusCode, body: d }))
    })
    r.on('error', (e) => resolve({ status: 0, body: 'ERR ' + e.message }))
    r.on('timeout', () => { r.destroy(); resolve({ status: 0, body: 'TIMEOUT' }) })
    if (body) r.write(body)
    r.end()
  })
}

const GCID = 'gcid_3znx57dpz2tz0b7'

;(async () => {
  const ct = String(Date.now())
  const params = 'dfid=-&appid=1005&mid=0&clientver=20109&clienttime=' + ct + '&uuid=-'
  const body = JSON.stringify({ ret_info: 1, data: [{ id: GCID, id_type: 2 }] })
  const uri = 'https://t.kugou.com/v1/songlist/batch_decode?' + params + '&signature=' + sign(params, AND_KEY, body)
  const r1 = await get(uri, { method: 'POST', body, ua: 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/83 Mobile Safari/537.36', headers: { Referer: 'https://m.kugou.com/' } })
  console.log('[decode] http', r1.status, r1.body.slice(0, 400))
  let j
  try { j = JSON.parse(r1.body) } catch (e) { return }
  const gid = j && j.data && j.data.list && j.data.list[0] && j.data.list[0].global_collection_id
  console.log('[decode] global_collection_id =', gid, ' info keys =', Object.keys((j.data.list[0] || {}).info || {}).join(','))
  if (!gid) return

  const ct2 = String(Date.now())
  const p2 = 'appid=1058&specialid=0&global_specialid=' + encodeURIComponent(gid) +
    '&format=jsonp&srcappid=2919&clientver=20000&clienttime=' + ct2 + '&mid=' + ct2 + '&uuid=' + ct2 + '&dfid=-'
  const r2 = await get('https://mobiles.kugou.com/api/v5/special/info_v2?' + p2 + '&signature=' + sign(p2, WEB_KEY), { headers: { mid: ct2, clienttime: ct2, dfid: '-', Referer: 'https://m3ws.kugou.com/share/index.php' } })
  console.log('\n[info_v2] http', r2.status, r2.body.slice(0, 500))

  const ct3 = String(Date.now())
  const p3 = 'appid=1058&global_specialid=' + encodeURIComponent(gid) +
    '&specialid=0&plat=0&version=8000&page=1&pagesize=300' +
    '&srcappid=2919&clientver=20000&clienttime=' + ct3 + '&mid=' + ct3 + '&uuid=' + ct3 + '&dfid=-'
  const r3 = await get('https://mobiles.kugou.com/api/v5/special/song_v2?' + p3 + '&signature=' + sign(p3, WEB_KEY), { headers: { mid: ct3, clienttime: ct3, dfid: '-', Referer: 'https://m3ws.kugou.com/share/index.php' } })
  console.log('\n[song_v2] http', r3.status, r3.body.slice(0, 500))
  try {
    const d = JSON.parse(r3.body)
    const info = (d.data && d.data.info) || []
    console.log('[song_v2] total =', d.data && d.data.total, ' list len =', info.length)
    if (info[0]) {
      console.log('[song_v2] item keys =', Object.keys(info[0]).join(','))
      console.log('[song_v2] item0 =', JSON.stringify(info[0]).slice(0, 800))
      console.log('[song_v2] 有 remark 的:', info.filter((s) => s.remark).length, info.filter((s) => s.remark).slice(0, 3).map((s) => ({ filename: s.filename, name: s.name, remark: s.remark })))
      console.log('[song_v2] duration 样本 =', info.map((s) => s.duration).slice(0, 6), ' timelen 样本 =', info.map((s) => s.timelen).slice(0, 6))
    }
  } catch (e) { console.log('[song_v2] parse fail', e.message) }
})()
