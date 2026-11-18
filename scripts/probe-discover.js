'use strict'
/* 探测首页推荐接口 */
const { request } = require('../app/lib/lx-engine.js')
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
function get (url, headers = {}, insecure = false) {
  return new Promise((resolve) => {
    request(url, { headers: Object.assign({ 'User-Agent': UA }, headers), insecure, timeout: 15000 }, (e, r) => {
      resolve(e ? { err: e.message } : { code: r.statusCode, body: r.body })
    })
  })
}
const brief = (r) => (r.err ? 'ERR ' + r.err : (r.code + ' ' + (typeof r.body === 'string' ? r.body : JSON.stringify(r.body)).slice(0, 300).replace(/\s+/g, ' ')))

;(async () => {
  const H = { Referer: 'https://music.163.com/', Cookie: 'appver=2.0.2; os=pc' }
  console.log('WY personalized:', brief(await get('https://music.163.com/api/personalized/playlist?limit=6&total=true', H)))
  console.log('WY newsong    :', brief(await get('https://music.163.com/api/personalized/newsong?limit=5', H)))
  console.log('WY recommend  :', brief(await get('https://music.163.com/api/v1/discovery/recommend/resource', H)))
  console.log('KG plist      :', brief(await get('https://m.kugou.com/plist/index?json=true', { Referer: 'https://m.kugou.com/' }, true)))
  console.log('QQ first      :', brief(await get('https://c.y.qq.com/v8/fcg-bin/fcg_first_yqq.fcg?format=json&tpl=v2&page=0&type=0&jsonpCallback=cb', { Referer: 'https://y.qq.com/' })))
})()
