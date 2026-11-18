'use strict'
/* 酷狗榜单 / 搜索建议接口探测 */
const { request } = require('../app/lib/lx-engine.js')
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
function get (url, headers = {}, insecure = true) {
  return new Promise((resolve) => {
    request(url, { headers: Object.assign({ 'User-Agent': UA }, headers), insecure, timeout: 15000 }, (e, r) => {
      resolve(e ? { err: e.message } : { code: r.statusCode, body: r.body })
    })
  })
}
const brief = (r) => (r.err ? 'ERR ' + r.err : (r.code + ' ' + String(typeof r.body === 'string' ? r.body : JSON.stringify(r.body)).slice(0, 260).replace(/\s+/g, ' ')))

;(async () => {
  const kw = encodeURIComponent('晴天')
  const targets = [
    ['rank/song', 'https://mobilecdn.kugou.com/api/v3/rank/song?rankid=8888&page=1&pagesize=3&format=json'],
    ['rank/list', 'https://mobilecdn.kugou.com/api/v3/rank/list?format=json&withsong=1'],
    ['m.rank.info', 'https://m.kugou.com/rank/info/?rankid=8888&page=1&json=true'],
    ['m.rank.ajax', 'https://m.kugou.com/rank/ajax_list?rankid=8888&page=1&pagesize=3&json=true'],
    ['suggest', 'https://suggest.kugou.com/search?keyword=' + kw],
    ['suggest2', 'https://searchsuggest.kugou.com/api/v1/search/suggestion?keyword=' + kw],
    ['qq.smartbox', 'https://c.y.qq.com/splcloud/fcgi-bin/smartbox_new.fcg?key=' + kw + '&format=json&g_tk=5381&inCharset=utf-8&outCharset=utf-8&platform=yqq'],
  ]
  for (const [n, u] of targets) {
    const r = await get(u, n.startsWith('qq') ? { Referer: 'https://y.qq.com/' } : { Referer: 'https://www.kugou.com/' })
    console.log(n.padEnd(12), brief(r))
  }
})()
