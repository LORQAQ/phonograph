'use strict'
/* 探测 QQ / 酷狗 公开搜索接口：node scripts/probe-search.js */
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
    const r = lib.request(u, { method: opts.method || (body ? 'POST' : 'GET'), headers, timeout: 15000, rejectUnauthorized: opts.insecure ? false : true }, (res) => {
      const c = []
      res.on('data', (d) => c.push(d))
      res.on('end', () => resolve({ code: res.statusCode, body: Buffer.concat(c).toString('utf8') }))
    })
    r.on('error', (e) => resolve({ err: (e.code || e.message) }))
    r.on('timeout', () => { r.destroy(); resolve({ err: 'timeout' }) })
    if (body) r.write(body)
    r.end()
  })
}

const kw = encodeURIComponent('晴天')

/* ---------- QQ 音乐 ---------- */
async function qq () {
  const out = {}

  // 1. musicu.fcg（DoSearchForQQMusicDesktop）
  const payload = {
    comm: { ct: '19', cv: '1859', uin: '0' },
    req: {
      method: 'DoSearchForQQMusicDesktop',
      module: 'music.search.SearchCgiService',
      param: { num_per_page: 5, page_num: 1, query: '晴天', search_type: 0 },
    },
  }
  let r = await req('https://u.y.qq.com/cgi-bin/musicu.fcg', {
    headers: { Referer: 'https://y.qq.com/', Origin: 'https://y.qq.com' },
    body: payload,
  })
  out.musicu = { code: r.code || r.err, body: (r.body || '').slice(0, 500) }

  // 2. client_search_cp
  r = await req('https://c.y.qq.com/soso/fcgi-bin/client_search_cp?ct=24&qqmusic_ver=1298&new_json=1&remoteplace=txt.yqq.song&searchid=1&t=0&aggr=1&cr=1&catZhida=1&lossless=0&flag_qc=0&p=1&n=5&w=' + kw + '&g_tk=5381&loginUin=0&hostUin=0&format=json&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=0', {
    headers: { Referer: 'https://y.qq.com/portal/playlist.html' },
  })
  out.clientSearch = { code: r.code || r.err, body: (r.body || '').slice(0, 400) }

  // 3. smartbox
  r = await req('https://c.y.qq.com/splcloud/fcgi-bin/smartbox_new.fcg?key=' + kw + '&format=json&g_tk=5381&inCharset=utf-8&outCharset=utf-8&platform=yqq', {
    headers: { Referer: 'https://y.qq.com/' },
  })
  out.smartbox = { code: r.code || r.err, body: (r.body || '').slice(0, 400) }

  return out
}

/* ---------- 酷狗 ---------- */
async function kugou () {
  const out = {}
  const targets = [
    ['mobilecdn-https', 'https://mobilecdn.kugou.com/api/v3/search/song?format=json&keyword=' + kw + '&page=1&pagesize=3&showtype=1'],
    ['mobilecdn-http', 'http://mobilecdn.kugou.com/api/v3/search/song?format=json&keyword=' + kw + '&page=1&pagesize=3&showtype=1'],
    ['mobiles', 'https://mobiles.kugou.com/api/v3/search/song?format=json&keyword=' + kw + '&page=1&pagesize=3&showtype=1'],
    ['songsearch-v2', 'https://songsearch.kugou.com/song_search_v2?keyword=' + kw + '&page=1&pagesize=3&platform=WebFilter&userid=-1&clientver=2000&iscorrection=1&privilege_filter=0&filter=10&token=&appid=1014'],
    ['complexsearch', 'https://complexsearch.kugou.com/v2/search/song?keyword=' + kw + '&page=1&pagesize=3&platform=WebFilter&userid=0&clientver=2000&iscorrection=1&privilege_filter=0&srcappid=2919&clienttime=1700000000000&mid=1&uuid=1&dfid=-&signature=0'],
  ]
  for (const [name, url] of targets) {
    const r = await req(url, { insecure: true, headers: { Referer: 'https://www.kugou.com/' } })
    out[name] = { code: r.code || r.err, body: (r.body || '').slice(0, 300) }
  }
  return out
}

;(async () => {
  console.log('===== QQ =====')
  console.log(JSON.stringify(await qq(), null, 1))
  console.log('===== 酷狗 =====')
  console.log(JSON.stringify(await kugou(), null, 1))
})()
