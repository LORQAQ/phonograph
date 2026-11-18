'use strict'
/* 打印 QQ / 酷狗搜索结果完整字段 + 歌词接口 */
const https = require('node:https')
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
function req (url, opts = {}) {
  return new Promise((resolve) => {
    const headers = Object.assign({ 'User-Agent': UA }, opts.headers || {})
    const r = https.get(url, { headers, timeout: 15000 }, (res) => {
      const c = []; res.on('data', (d) => c.push(d)); res.on('end', () => resolve({ code: res.statusCode, body: Buffer.concat(c).toString('utf8') }))
    })
    r.on('error', (e) => resolve({ err: e.code || e.message }))
    r.on('timeout', () => { r.destroy(); resolve({ err: 'timeout' }) })
  })
}
;(async () => {
  const kw = encodeURIComponent('晴天')
  // QQ
  const qq = await req('https://c.y.qq.com/soso/fcgi-bin/search_for_qq_cp?w=' + kw + '&p=1&n=2&format=json&platform=yqq', { headers: { Referer: 'https://y.qq.com/' } })
  const qqj = JSON.parse(qq.body)
  const qs = qqj.data.song.list
  console.log('QQ 歌曲数', qs.length, 'total', qqj.data.song.totalnum)
  console.log('QQ keys:', Object.keys(qs[0]).join(','))
  console.log('QQ first:', JSON.stringify(qs[0]).slice(0, 900))
  console.log('QQ payload 字段:', JSON.stringify({
    songmid: qs[0].songmid, songid: qs[0].songid, media_mid: qs[0].media_mid, strMediaMid: qs[0].strMediaMid,
    songname: qs[0].songname, interval: qs[0].interval, albummid: qs[0].albummid, albumname: qs[0].albumname,
    singer: qs[0].singer, size320: qs[0].size320, size128: qs[0].size128,
  }))

  // QQ 歌词
  const mid = qs[0].songmid
  const ly = await req('https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=' + mid + '&format=json&nobase64=1&g_tk=5381&loginUin=0&hostUin=0&platform=yqq&needNewCode=0', { headers: { Referer: 'https://y.qq.com/portal/player.html' } })
  console.log('QQ lyric:', (ly.body || '').slice(0, 160).replace(/\s+/g, ' '))

  // 酷狗
  const kg = await req('https://mobilecdn.kugou.com/api/v3/search/song?format=json&keyword=' + kw + '&page=1&pagesize=2&showtype=1')
  const kgj = JSON.parse(kg.body)
  console.log('\n酷狗 total', kgj.data.total, 'keys:', Object.keys(kgj.data.info[0]).join(','))
  console.log('酷狗 first:', JSON.stringify(kgj.data.info[0]).slice(0, 700))
})()
