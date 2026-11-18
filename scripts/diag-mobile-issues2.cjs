'use strict'
/* 精确查看三处实现 */
const fs = require('node:fs')

const api = fs.readFileSync('mobile/www/api-mobile.js', 'utf8')
const app = fs.readFileSync('mobile/www/app.js', 'utf8')

/* ---------- 1. 酷狗歌单分支 ---------- */
console.log('=== 酷狗歌单分支 ===')
const kgStart = api.indexOf('/* 酷狗 */')
if (kgStart > 0) {
  console.log(api.slice(kgStart, kgStart + 1600))
}

/* ---------- 2. navGo / navPush ---------- */
console.log('\n\n=== navGo ===')
const ni = app.indexOf('function navGo')
if (ni > 0) console.log(app.slice(ni, ni + 900))

console.log('\n=== navPush ===')
const npi = app.indexOf('function navPush')
if (npi > 0) console.log(app.slice(npi, npi + 600))

/* ---------- 3. 推荐歌单渲染 ---------- */
console.log('\n\n=== renderRecommendView ===')
const ri = app.indexOf('function renderRecommendView')
if (ri > 0) console.log(app.slice(ri, ri + 2000))

/* ---------- 4. 移动端顶栏 HTML ---------- */
console.log('\n\n=== 移动端顶栏 ===')
const html = fs.readFileSync('mobile/www/index.html', 'utf8')
const tb = html.match(/<header class="topbar">[\s\S]*?<\/header>/)
if (tb) console.log(tb[0])
