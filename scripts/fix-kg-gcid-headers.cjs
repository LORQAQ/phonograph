'use strict'
/* 修 gcid 分支的 headers：不能用 api.HEADERS（那是 API 用的，网页请求会返回 loading 页） */
process.chdir(require('node:path').resolve(__dirname, '..'))
const fs = require('node:fs')
const p = 'app/lib/playlist-import.js'
let s = fs.readFileSync(p, 'utf8')

const old = `    const html = await new Promise((resolve, reject) => {
      request('https://m.kugou.com/songlist/' + gid + '/',
        { headers: api.HEADERS, insecure: true, timeout: 25000 },
        (e, r) => e ? reject(new Error('酷狗歌单页打不开: ' + e.message)) : resolve(String(r.body || '')))
    })`

const neu = `    /* 注意：这里不能用 api.HEADERS —— 那是给 API 接口用的（带 kg_mid Cookie），
       拿去请求网页会返回一个 16KB 的 loading 壳页，里面没有歌曲数据。
       网页要用移动浏览器 UA。 */
    const kgWebHeaders = {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36',
      Referer: 'https://m.kugou.com/',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    }
    const html = await new Promise((resolve, reject) => {
      request('https://m.kugou.com/songlist/' + gid + '/',
        { headers: kgWebHeaders, insecure: true, timeout: 25000 },
        (e, r) => e ? reject(new Error('酷狗歌单页打不开: ' + e.message)) : resolve(String(r.body || '')))
    })`

if (s.includes(old)) {
  s = s.replace(old, neu)
  fs.writeFileSync(p, s, 'utf8')
  console.log('✓ gcid 分支改用移动浏览器 headers')
} else {
  console.log('未匹配，当前内容：')
  const i = s.indexOf("request('https://m.kugou.com/songlist/'")
  if (i > 0) console.log(s.slice(Math.max(0, i - 300), i + 300))
}
