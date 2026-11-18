const { request } = require('../app/lib/lx-engine.js')
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const H = { 'User-Agent': UA, Referer: 'https://music.163.com/', Cookie: 'appver=2.0.2; os=pc' }
const u = 'https://music.163.com/api/cloudsearch/pc?s=' + encodeURIComponent('晴天 周杰伦') + '&type=1&offset=0&limit=3'
request(u, { headers: H, timeout: 15000 }, (err, r) => {
  if (err) return console.log('ERR', err.message)
  const body = r.body
  const songs = body && body.result && body.result.songs
  console.log('count', songs && songs.length, 'songCount', body.result && body.result.songCount)
  if (songs && songs[0]) {
    console.log('keys', Object.keys(songs[0]).join(','))
    const s = songs[0]
    console.log(JSON.stringify({ id: s.id, name: s.name, ar: s.ar, al: s.al, dt: s.dt, fee: s.fee, privilege: s.privilege }, null, 1).slice(0, 1200))
  }
})
