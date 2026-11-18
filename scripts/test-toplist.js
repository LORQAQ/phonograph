const { request } = require('../app/lib/lx-engine.js')
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const H = { 'User-Agent': UA, Referer: 'https://music.163.com/', Cookie: 'appver=2.0.2; os=pc' }
const urls = [
  'https://music.163.com/api/playlist/track/all?id=3778678&limit=10&offset=0',
  'https://music.163.com/api/playlist/detail?id=3778678',
  'https://music.163.com/api/toplist/detail',
  'https://music.163.com/api/v1/playlist/manipulate/tracks?id=3778678',
  'https://music.163.com/api/song/detail/?id=186016&ids=%5B186016%5D',
]
;(async () => {
  for (const u of urls) {
    await new Promise((res) => {
      request(u, { headers: H, timeout: 15000 }, (err, r) => {
        const b = r && (typeof r.body === 'string' ? r.body : JSON.stringify(r.body))
        console.log((err ? 'ERR' : r.statusCode), u.slice(23, 90), '|', String(b).slice(0, 220).replace(/\s+/g, ' '))
        res()
      })
    })
    await new Promise((r) => setTimeout(r, 600))
  }
})()
