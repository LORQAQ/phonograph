'use strict'
/* 酷狗字段与歌词接口探测 */
const { request } = require('../app/lib/lx-engine.js')
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

function get (url, headers = {}, insecure = false) {
  return new Promise((resolve) => {
    request(url, { headers: Object.assign({ 'User-Agent': UA }, headers), insecure, timeout: 15000 }, (e, r) => {
      resolve(e ? { err: e.message } : { code: r.statusCode, body: r.body })
    })
  })
}

;(async () => {
  const kw = encodeURIComponent('晴天')
  const r = await get('https://mobilecdn.kugou.com/api/v3/search/song?format=json&keyword=' + kw + '&page=1&pagesize=3&showtype=1', { Referer: 'https://www.kugou.com/' }, true)
  if (r.err) return console.log('搜索失败', r.err)
  const j = typeof r.body === 'string' ? JSON.parse(r.body) : r.body
  console.log('code', r.code, 'total', j.data.total)
  const s = j.data.info[0]
  console.log('keys:', Object.keys(s).join(','))
  console.log('first:', JSON.stringify(s).slice(0, 900))

  // 歌词
  const hash = s.hash
  const kr = await get('https://krcs.kugou.com/search?ver=1&man=yes&client=mobi&keyword=&duration=' + (s.duration || '') + '&hash=' + hash, { Referer: 'https://www.kugou.com/' }, true)
  console.log('krcs:', (kr.body && JSON.stringify(kr.body).slice(0, 300)) || kr.err)
  let cand = null
  try { cand = (typeof kr.body === 'string' ? JSON.parse(kr.body) : kr.body).candidates[0] } catch (e) {}
  if (cand) {
    const dl = await get('https://lyrics.kugou.com/download?ver=1&client=pc&id=' + cand.id + '&accesskey=' + cand.accesskey + '&fmt=lrc&charset=utf8', { Referer: 'https://www.kugou.com/' }, true)
    let content = ''
    try { content = Buffer.from(JSON.parse(dl.body).content, 'base64').toString('utf8') } catch (e) { content = String(dl.body).slice(0, 80) }
    console.log('lyric head:', content.slice(0, 160).replace(/\s+/g, ' '))
  }
})()
