const { request } = require('../app/lib/lx-engine.js')
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const H = { 'User-Agent': UA, Referer: 'https://music.163.com/', Cookie: 'appver=2.0.2; os=pc' }
function get (u) {
  return new Promise((res) => request(u, { headers: H, timeout: 15000 }, (e, r) => res(e ? { err: e.message } : r.body)))
}
;(async () => {
  const d = await get('https://music.163.com/api/v6/playlist/detail?id=3778678&n=60')
  const pl = d.playlist
  console.log('v6 keys', pl ? Object.keys(pl).join(',') : JSON.stringify(d).slice(0, 200))
  const ids = (pl && pl.trackIds || []).slice(0, 5).map((x) => x.id)
  console.log('ids', ids.join(','))
  if (ids.length) {
    const s = await get('https://music.163.com/api/song/detail/?ids=[' + ids.join(',') + ']')
    console.log('songs', s.songs && s.songs.length, s.songs && s.songs[0] && s.songs[0].name, s.songs && s.songs[0] && s.songs[0].artists.map((a) => a.name).join('/'))
  }
})()
