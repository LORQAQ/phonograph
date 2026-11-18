'use strict'
/* 第三轮：QQ 单曲详情 / 榜单 / 第三方聚合 */
const https = require('node:https')
const http = require('node:http')
const { URL } = require('node:url')
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

function req (url, opts = {}) {
  return new Promise((resolve) => {
    let u
    try { u = new URL(url) } catch (e) { return resolve({ err: 'bad url' }) }
    const lib = u.protocol === 'https:' ? https : http
    const headers = Object.assign({ 'User-Agent': UA }, opts.headers || {})
    let body = opts.body
    if (body && typeof body !== 'string') body = JSON.stringify(body)
    if (body) { headers['Content-Type'] = headers['Content-Type'] || 'application/json'; headers['Content-Length'] = Buffer.byteLength(body) }
    const r = lib.request(u, { method: opts.method || (body ? 'POST' : 'GET'), headers, timeout: 15000 }, (res) => {
      const c = []
      res.on('data', (d) => c.push(d))
      res.on('end', () => resolve({ code: res.statusCode, body: Buffer.concat(c).toString('utf8') }))
    })
    r.on('error', (e) => resolve({ err: e.code || e.message }))
    r.on('timeout', () => { r.destroy(); resolve({ err: 'timeout' }) })
    if (body) r.write(body)
    r.end()
  })
}
const brief = (r) => (r.err ? 'ERR ' + r.err : (r.code + ' ' + (r.body || '').slice(0, 300).replace(/\s+/g, ' ')))

;(async () => {
  const mid = '0039MnYb0qxYhV'

  // 1. 单曲详情
  console.log('1 single:', brief(await req('https://c.y.qq.com/v8/fcg-bin/fcg_play_single_song.fcg?songmid=' + mid + '&platform=yqq&format=json&inCharset=utf8&outCharset=utf-8', { headers: { Referer: 'https://y.qq.com/' } })))

  // 2. musicu get_song_detail
  console.log('2 detail:', brief(await req('https://u.y.qq.com/cgi-bin/musicu.fcg', {
    headers: { Referer: 'https://y.qq.com/' },
    body: { comm: { ct: 24, cv: 0, format: 'json' }, req: { module: 'music.pf_song_detail_svr', method: 'get_song_detail', param: { song_mid: mid } } },
  })))

  // 3. 榜单
  console.log('3 toplist:', brief(await req('https://c.y.qq.com/v8/fcg-bin/fcg_v8_toplist_cp.fcg?topid=26&page=detail&type=top&song_begin=0&song_num=5&format=json&platform=yqq', { headers: { Referer: 'https://y.qq.com/' } })))

  // 4. 搜索变体
  console.log('4 search_for_qq_cp:', brief(await req('https://c.y.qq.com/soso/fcgi-bin/search_for_qq_cp?w=' + encodeURIComponent('晴天') + '&p=1&n=5&format=json&platform=yqq', { headers: { Referer: 'https://y.qq.com/' } })))
  console.log('5 musicu-mobile:', brief(await req('https://u.y.qq.com/cgi-bin/musicu.fcg', {
    headers: { Referer: 'https://y.qq.com/', 'User-Agent': 'QQMusic/14.1.0 (com.tencent.qqmusic; build:1; iOS 16.0) ' },
    body: { comm: { ct: 11, cv: 140100, v: 140100, uin: '0', format: 'json' }, req: { module: 'music.search.SearchCgiService', method: 'DoSearchForQQMusicMobile', param: { query: '晴天', page_num: 1, num_per_page: 5, search_type: 0 } } },
  })))

  // 6. 第三方
  for (const [n, u] of [
    ['vkeys', 'https://api.vkeys.cn/v2/music/tencent?word=' + encodeURIComponent('晴天') + '&num=5'],
    ['bugpk', 'https://api.bugpk.com/api/qqmusic?msg=' + encodeURIComponent('晴天')],
    ['66api', 'https://api.66mz8.com/api/music.qq.php?name=' + encodeURIComponent('晴天')],
    ['meting-hf', 'https://meting.mikus.xyz/api?server=tencent&type=search&id=' + encodeURIComponent('晴天')],
    ['meting-jm', 'https://api.jmss.xyz/api?server=tencent&type=search&id=' + encodeURIComponent('晴天')],
  ]) {
    console.log('6 ' + n + ':', brief(await req(u)))
  }
})()
