'use strict'
/* 下载 UI 素材：Unsplash 图片、Lottie 动画、lottie-web 运行时 */
const https = require('node:https')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const { URL } = require('node:url')

const OUT = path.join(__dirname, '..', 'public', 'assets')
fs.mkdirSync(OUT, { recursive: true })
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

function download (url, dest, redirects = 0) {
  return new Promise((resolve) => {
    let u
    try { u = new URL(url) } catch (e) { return resolve({ ok: false, err: 'bad url' }) }
    const lib = u.protocol === 'https:' ? https : http
    lib.get(u, { headers: { 'User-Agent': UA, Accept: '*/*' }, timeout: 30000 }, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 4) {
        res.resume()
        return resolve(download(new URL(res.headers.location, u).toString(), dest, redirects + 1))
      }
      if (res.statusCode !== 200) { res.resume(); return resolve({ ok: false, err: 'HTTP ' + res.statusCode }) }
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        const buf = Buffer.concat(chunks)
        fs.writeFileSync(dest, buf)
        resolve({ ok: true, bytes: buf.length })
      })
    }).on('error', (e) => resolve({ ok: false, err: e.code || e.message }))
      .on('timeout', function () { this.destroy(); resolve({ ok: false, err: 'timeout' }) })
  })
}

const files = [
  // Unsplash 图片（音乐场景）
  ['banner-1.jpg', 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=1400&q=75&fm=jpg&fit=crop'],
  ['banner-2.jpg', 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=1400&q=75&fm=jpg&fit=crop'],
  ['banner-3.jpg', 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=1400&q=75&fm=jpg&fit=crop'],
  ['cover-1.jpg', 'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=600&q=75&fm=jpg&fit=crop'],
  ['cover-2.jpg', 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=600&q=75&fm=jpg&fit=crop'],
  ['cover-3.jpg', 'https://images.unsplash.com/photo-1506157786151-b8491531f063?w=600&q=75&fm=jpg&fit=crop'],
  ['cover-4.jpg', 'https://images.unsplash.com/photo-1520523839897-bd0b52f945a0?w=600&q=75&fm=jpg&fit=crop'],
  // Lottie 运行时 + 动画
  ['lottie.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.12.2/lottie.min.js'],
  ['lottie-eq.json', 'https://assets10.lottiefiles.com/packages/lf20_kyu7xb1v.json'],
]

;(async () => {
  for (const [name, url] of files) {
    const r = await download(url, path.join(OUT, name))
    console.log((r.ok ? '✅' : '❌') + ' ' + name.padEnd(16) + (r.ok ? r.bytes + 'B' : r.err))
  }
})()
