'use strict'
/* 诊断：酷狗播放失败 + 网易云只放一半 */
const fs = require('node:fs')

const api = fs.readFileSync('mobile/www/api-mobile.js', 'utf8')
const eng = fs.readFileSync('mobile/www/lib/lx-engine-web.js', 'utf8')
const app = fs.readFileSync('mobile/www/app.js', 'utf8')

/* ---------- 1. 酷狗取流 ---------- */
console.log('=== 1. 手机端酷狗取流 ===')
const kgPlay = api.indexOf('play/getdata')
if (kgPlay > 0) {
  console.log(api.slice(Math.max(0, kgPlay - 400), kgPlay + 900))
} else {
  console.log('未找到 play/getdata')
}

console.log('\n=== resolveUrl 里的 kg 分支 ===')
const ri = api.indexOf('async function resolveUrl')
if (ri > 0) console.log(api.slice(ri, ri + 1400))

/* ---------- 2. 网易云残缺检测 ---------- */
console.log('\n\n=== 2. 残缺检测（app.js）===')
const ci = app.indexOf('checkPreviewAndSwitch')
if (ci > 0) console.log(app.slice(ci, ci + 1500))

/* ---------- 3. 引擎里的残缺检测 ---------- */
console.log('\n\n=== 3. 引擎残缺检测 ===')
const ei = eng.indexOf('checkPreviewAndSwitch')
if (ei > 0) console.log(eng.slice(ei, ei + 1200))
else console.log('引擎里没有 checkPreviewAndSwitch')
