'use strict'
/* 探测三平台歌单详情接口 */
const { request } = require('../app/lib/lx-engine.js')
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

function get (url, headers = {}, insecure = false) {
  return new Promise((resolve) => {
    request(url, { headers: Object.assign({ 'User-Agent': UA }, headers), insecure, timeout: 15000 }, (e, r) => {
      resolve(e ? { err: e.message } : { code: r.statusCode, body: r.body })
    })
  })
}
const brief = (r) => (r.err ? 'ERR ' + r.err : (r.code + ' ' + (typeof r.body === 'string' ? r.body : JSON.stringify(r.body)).slice(0, 320).replace(/\s+/g, ' ')))

;(async () => {
  // 网易云歌单
  const wy = await get('https://music.163.com/api/v6/playlist/detail?id=24381616&n=1000', { Referer: 'https://music.163.com/', Cookie: 'appver=2.0.2; os=pc' })
  console.log('WY :', brief(wy))

  // QQ 歌单
  const qq = await get('https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0&disstid=7011264340&format=json&g_tk=5381&loginUin=0&hostUin=0&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=0', { Referer: 'https://y.qq.com/' })
  console.log('QQ :', brief(qq))

  // 酷狗歌单
  const kg = await get('https://mobilecdn.kugou.com/api/v3/special/song?specialid=313869&page=1&pagesize=5&format=json', { Referer: 'https://www.kugou.com/' }, true)
  console.log('KG :', brief(kg))
})()
