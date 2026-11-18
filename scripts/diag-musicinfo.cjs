'use strict'
/* 手机端取流失败根因：musicInfo 里的 name/singer 是空的，音源构造请求时拿不到歌名歌手 */
const fs = require('node:fs')

const api = fs.readFileSync('mobile/www/api-mobile.js', 'utf8')
const app = fs.readFileSync('mobile/www/app.js', 'utf8')

console.log('=== songParams 生成哪些参数 ===')
const i = app.indexOf('function songParams')
if (i > 0) console.log(app.slice(i, i + 700))

console.log('\n=== api-mobile 的 /api/url 处理 ===')
const j = api.indexOf("'/api/url'")
if (j > 0) console.log(api.slice(Math.max(0, j - 120), j + 800))

console.log('\n=== LxScriptManager.resolve 需要的 musicInfo 字段 ===')
const eng = fs.readFileSync('mobile/www/lib/lx-engine-web.js', 'utf8')
const k = eng.indexOf('async resolve')
if (k > 0) {
  const seg = eng.slice(k, k + 2000)
  console.log(seg)
}
