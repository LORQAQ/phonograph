const { request } = require('../app/lib/lx-engine.js')
const u = 'https://music-api.gdstudio.xyz/api.php?types=search&source=netease&name=' + encodeURIComponent('屋顶') + '&count=3&pages=1'
const variants = [
  { name: 'no-ref', headers: {} },
  { name: 'gd-ref', headers: { Referer: 'https://music.gdstudio.xyz/' } },
  { name: 'bx-ref', headers: { Referer: 'https://music.gdstudio.xyz/', Origin: 'https://music.gdstudio.xyz' } },
]
;(async () => {
  for (const v of variants) {
    await new Promise((resolve) => {
      request(u, { headers: Object.assign({ 'User-Agent': 'Mozilla/5.0 Chrome/126' }, v.headers), timeout: 15000 }, (err, resp) => {
        console.log(v.name, err ? 'ERR ' + err.message : resp.statusCode, String(resp && resp.body).slice(0, 200).replace(/\s+/g, ' '))
        resolve()
      })
    })
    await new Promise((r) => setTimeout(r, 1500))
  }
})()
