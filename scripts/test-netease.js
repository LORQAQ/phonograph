const { request } = require('../app/lib/lx-engine.js')
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const H = { 'User-Agent': UA, Referer: 'https://music.163.com/', Cookie: 'appver=2.0.2; os=pc', Accept: '*/*' }
const kw = encodeURIComponent('屋顶')
const urls = [
  'https://music.163.com/api/search/get/web?s=' + kw + '&type=1&offset=0&limit=5',
  'https://music.163.com/api/song/detail/?ids=[5257138]',
  'https://music.163.com/api/song/lyric?id=5257138&lv=1&kv=1&tv=1',
  'https://music.163.com/api/cloudsearch/pc?s=' + kw + '&type=1&offset=0&limit=5',
  'https://api.gdstudio.xyz/api.php?types=search&source=netease&name=' + kw + '&count=2&pages=1',
  'https://music.gdstudio.xyz/api.php?types=search&source=netease&name=' + kw + '&count=2&pages=1',
]
;(async () => {
  for (const u of urls) {
    await new Promise((res) => {
      request(u, { headers: H, timeout: 15000 }, (err, r) => {
        const b = r && (typeof r.body === 'string' ? r.body : JSON.stringify(r.body))
        console.log((err ? 'ERR ' + err.message : r.statusCode), u.slice(0, 78), '|', String(b).slice(0, 160).replace(/\s+/g, ' '))
        res()
      })
    })
    await new Promise((r) => setTimeout(r, 800))
  }
})()
