const { request } = require('../app/lib/lx-engine.js')
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const H = { 'User-Agent': UA, Referer: 'https://music.163.com/', Cookie: 'appver=2.0.2; os=pc' }
const u = 'https://music.163.com/api/playlist/detail?id=3778678'
request(u, { headers: H, timeout: 15000 }, (err, r) => {
  if (err) return console.log('ERR', err.message)
  const b = r.body
  const pl = b && b.result && b.result.playlist
  console.log('code', b.code, 'keys', pl ? Object.keys(pl).join(',') : 'no playlist')
  console.log('trackCount', pl && pl.trackCount, 'tracks', pl && pl.tracks && pl.tracks.length)
  if (pl && pl.tracks && pl.tracks[0]) console.log('first', JSON.stringify(pl.tracks[0]).slice(0, 300))
  if (pl && pl.trackIds) console.log('trackIds', pl.trackIds.length, JSON.stringify(pl.trackIds[0]))
})
