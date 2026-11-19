'use strict'
/* Audit: song_v2 trans_param 里的封面字段 + cover 是否存在；{size} 未替换会怎样 */
const https = require('node:https')

function get (url, opts = {}) {
  return new Promise((resolve) => {
    const u = new URL(url)
    const lib = u.protocol === 'https:' ? https : require('node:http')
    const r = lib.request({
      hostname: u.hostname, path: u.pathname + u.search, method: opts.method || 'GET',
      headers: Object.assign({ 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 11_0 like Mac OS X) Mobile Safari/604.1' }, opts.headers || {}),
      timeout: 15000, rejectUnauthorized: false,
    }, (res) => {
      let d = ''
      res.on('data', (c) => { d += c })
      res.on('end', () => resolve({ status: res.statusCode, body: d, headers: res.headers }))
    })
    r.on('error', (e) => resolve({ status: 0, body: 'ERR ' + e.message }))
    r.on('timeout', () => { r.destroy(); resolve({ status: 0, body: 'TIMEOUT' }) })
    if (opts.body) r.write(opts.body)
    r.end()
  })
}

;(async () => {
  /* 1) 直接验证 getListInfo 返回的 imgurl（带 {size}）拿来当图会怎样 */
  const rawCover = 'http://c1.kgimg.com/stdmusic/%7Bsize%7D/20251030/20251030060652243259.jpg'
  const fixedCover = 'http://c1.kgimg.com/stdmusic/400/20251030/20251030060652243259.jpg'
  for (const [label, u] of [['未替换 {size}', 'http://c1.kgimg.com/stdmusic/{size}/20251030/20251030060652243259.jpg'], ['替换成 400', fixedCover]]) {
    const r = await get(u)
    console.log(label.padEnd(14), '->', r.status, String(r.status === 200 ? (r.headers['content-type'] || '') : r.body.slice(0, 60)))
  }
})()
