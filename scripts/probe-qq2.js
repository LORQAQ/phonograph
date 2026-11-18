'use strict'
/* 第二轮 QQ 音乐搜索接口探测 */
const https = require('node:https')
const { URL } = require('node:url')
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

function req (url, opts = {}) {
  return new Promise((resolve) => {
    let u
    try { u = new URL(url) } catch (e) { return resolve({ err: 'bad url' }) }
    const headers = Object.assign({ 'User-Agent': UA }, opts.headers || {})
    let body = opts.body
    if (body && typeof body !== 'string') body = JSON.stringify(body)
    if (body) { headers['Content-Type'] = headers['Content-Type'] || 'application/json'; headers['Content-Length'] = Buffer.byteLength(body) }
    const r = https.request(u, { method: opts.method || (body ? 'POST' : 'GET'), headers, timeout: 15000 }, (res) => {
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
const brief = (r) => (r.err ? 'ERR ' + r.err : (r.code + ' ' + (r.body || '').slice(0, 260).replace(/\s+/g, ' ')))

;(async () => {
  const q = encodeURIComponent('晴天')

  // A. musicu POST，不同 comm
  const A = {
    comm: { uin: '0', format: 'json', ct: 24, cv: 0, platform: 'yqq.json' },
    req: {
      module: 'music.search.SearchCgiService',
      method: 'DoSearchForQQMusicDesktop',
      param: { query: '晴天', page_num: 1, num_per_page: 5, search_type: 0, grp: 1, song_num: 5 },
    },
  }
  console.log('A musicu:', brief(await req('https://u.y.qq.com/cgi-bin/musicu.fcg', { headers: { Referer: 'https://y.qq.com/', Cookie: 'qm_keyst=; uin=0' }, body: A })))

  // B. musicu GET（data 参数）
  const Burl = 'https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&data=' + encodeURIComponent(JSON.stringify({
    comm: { ct: 24, cv: 0, format: 'json' },
    req: { module: 'music.search.SearchCgiService', method: 'DoSearchForQQMusicDesktop', param: { query: '晴天', page_num: 1, num_per_page: 5, search_type: 0 } },
  }))
  console.log('B musicu-get:', brief(await req(Burl, { headers: { Referer: 'https://y.qq.com/' } })))

  // C. client_search_cp 加 cookie/guid
  const C = 'https://c.y.qq.com/soso/fcgi-bin/client_search_cp?ct=24&qqmusic_ver=1298&new_json=1&remoteplace=txt.yqq.song&searchid=1&t=0&aggr=1&cr=1&catZhida=1&lossless=0&flag_qc=0&p=1&n=5&w=' + q + '&g_tk=5381&loginUin=0&hostUin=0&format=json&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=0&uin=0'
  console.log('C client_search:', brief(await req(C, { headers: { Referer: 'https://y.qq.com/', Cookie: 'uin=0; pgv_pvi=1234567890' } })))

  // D. 网页 SSR 搜索页
  console.log('D ssr page:', brief(await req('https://y.qq.com/n/ryqq/search?w=' + q + '&t=song&remoteplace=txt.yqq.center', { headers: { Referer: 'https://y.qq.com/' } })))

  // E. smartbox 取歌曲列表
  const E = await req('https://c.y.qq.com/splcloud/fcgi-bin/smartbox_new.fcg?key=' + q + '&format=json&g_tk=5381&inCharset=utf-8&outCharset=utf-8&platform=yqq', { headers: { Referer: 'https://y.qq.com/' } })
  console.log('E smartbox:', brief(E))
  try {
    const j = JSON.parse(E.body)
    console.log('   smartbox song count:', j.data && j.data.song && j.data.song.count, 'first:', JSON.stringify(j.data && j.data.song && j.data.song.itemlist && j.data.song.itemlist[0]))
  } catch (e) {}

  // F. Meting API 镜像
  for (const api of [
    'https://api.injahow.cn/meting/?server=tencent&type=search&id=' + q,
    'https://api.i-meto.com/meting/api?server=tencent&type=search&id=' + q,
    'https://test.87dns.com/api/meting/?server=tencent&type=search&id=' + q,
  ]) {
    console.log('F meting:', api.slice(8, 40), brief(await req(api)))
  }
})()
