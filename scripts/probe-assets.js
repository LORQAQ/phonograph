'use strict'
/* 素材源连通性探测 */
const https = require('node:https')
const http = require('node:http')
const { URL } = require('node:url')
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

function head (url, redirects = 0) {
  return new Promise((resolve) => {
    let u
    try { u = new URL(url) } catch (e) { return resolve({ err: 'bad url' }) }
    const lib = u.protocol === 'https:' ? https : http
    const req = lib.get(u, { headers: { 'User-Agent': UA, Accept: '*/*' }, timeout: 12000 }, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 3) {
        res.resume()
        return resolve(head(new URL(res.headers.location, u).toString(), redirects + 1))
      }
      let n = 0
      res.on('data', (c) => { n += c.length; if (n > 4000) req.destroy() })
      res.on('end', () => resolve({ code: res.statusCode, type: res.headers['content-type'], bytes: n }))
      res.on('close', () => resolve({ code: res.statusCode, type: res.headers['content-type'], bytes: n }))
    })
    req.on('error', (e) => resolve({ err: e.code || e.message }))
    req.on('timeout', () => { req.destroy(); resolve({ err: 'timeout' }) })
  })
}

const targets = [
  ['picsum', 'https://picsum.photos/800/400'],
  ['unsplash', 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&q=80'],
  ['iconify', 'https://api.iconify.design/mdi/music-note.svg?color=%2331c27c'],
  ['lottie-cdn', 'https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.12.2/lottie.min.js'],
  ['lottie-unpkg', 'https://unpkg.com/lottie-web@5.12.2/build/player/lottie.min.js'],
  ['lottie-ghproxy', 'https://ghproxy.net/https://raw.githubusercontent.com/airbnb/lottie-web/master/build/player/lottie.min.js'],
  ['npmmirror', 'https://registry.npmmirror.com/lottie-web/-/lottie-web-5.12.2.tgz'],
  ['lottie-assets', 'https://assets10.lottiefiles.com/packages/lf20_kyu7xb1v.json'],
  ['gitee-img', 'https://gitee.com/static/images/logo-black.svg'],
]

;(async () => {
  for (const [name, url] of targets) {
    const r = await head(url)
    console.log(name.padEnd(14), r.err ? 'ERR ' + r.err : `${r.code} ${(r.type || '').slice(0, 30)} ${r.bytes}B`)
  }
})()
