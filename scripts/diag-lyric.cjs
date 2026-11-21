'use strict'
/* 在 Node 里跑手机端的 NET_WY.lyric / NET_TX.lyric，定位歌词为什么空 */
const path = require('node:path')
const fs = require('node:fs')
const https = require('node:https')
const http = require('node:http')
process.chdir(path.resolve(__dirname, '..'))

/* 用真网络实现 __REQ__（签名与 native-http 一致：url, opts, cb(err, {statusCode, headers, body})） */
globalThis.__REQ__ = function (url, opts, cb) {
  if (typeof opts === 'function') { cb = opts; opts = {} }
  opts = opts || {}
  let u
  try { u = new URL(url) } catch (e) { return cb(new Error('bad url ' + url)) }
  const mod = u.protocol === 'https:' ? https : http
  const req = mod.request({
    hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: opts.method || 'GET',
    headers: opts.headers || {}, timeout: opts.timeout || 15000,
    rejectUnauthorized: false,
  }, (res) => {
    const chunks = []
    res.on('data', (c) => chunks.push(c))
    res.on('end', () => {
      cb(null, { statusCode: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') })
    })
  })
  req.on('timeout', () => { try { req.destroy() } catch (e) { } cb(new Error('timeout')) })
  req.on('error', (e) => cb(e))
  if (opts.body) req.write(opts.body)
  req.end()
}

/* 载入手机端接口层 */
const code = fs.readFileSync('mobile/www/lib/music-libs.js', 'utf8')
try {
  /* eslint-disable no-eval */
  new Function(code)()
} catch (e) {
  console.log('✗ music-libs 执行失败: ' + e.message)
  process.exit(1)
}

const WY = globalThis.NET_WY
const TX = globalThis.NET_TX
const KG = globalThis.NET_KG
console.log('=== 载入结果 ===')
console.log('  NET_WY: ' + (WY ? 'ok' : '缺失'))
console.log('  NET_TX: ' + (TX ? 'ok' : '缺失'))
console.log('  NET_KG: ' + (KG ? 'ok' : '缺失'))

;(async () => {
  console.log('\n=== NET_WY.lyric(287398 我不难过) ===')
  try {
    const r = await WY.lyric('287398')
    console.log('  lyric 长度: ' + ((r && r.lyric) || '').length)
    console.log('  tlyric 长度: ' + ((r && r.tlyric) || '').length)
    if (r && r.lyric) console.log('  前 80 字: ' + r.lyric.slice(0, 80).replace(/\n/g, ' | '))
  } catch (e) {
    console.log('  ✗ 抛错: ' + e.message)
  }

  console.log('\n=== 再调一次（检查缓存是否破坏结果） ===')
  try {
    const r2 = await WY.lyric('287398')
    console.log('  lyric 长度: ' + ((r2 && r2.lyric) || '').length)
  } catch (e) {
    console.log('  ✗ 抛错: ' + e.message)
  }

  console.log('\n=== NET_WY.search（对比搜索是否正常） ===')
  try {
    const s = await WY.search('我不难过 孙燕姿', 1, 3)
    console.log('  结果数: ' + ((s && s.list) || []).length)
    if (s && s.list && s.list[0]) console.log('  第一首: ' + s.list[0].name + ' / ' + s.list[0].singer + ' id=' + s.list[0].id)
  } catch (e) {
    console.log('  ✗ 抛错: ' + e.message)
  }
})()