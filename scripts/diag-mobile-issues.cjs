'use strict'
/* 诊断手机端三个问题：酷狗歌单 / 返回导航 / 推荐歌单不显示 */
const fs = require('node:fs')

const api = fs.readFileSync('mobile/www/api-mobile.js', 'utf8')
const app = fs.readFileSync('mobile/www/app.js', 'utf8')
const html = fs.readFileSync('mobile/www/index.html', 'utf8')

/* ---------- 1. 酷狗歌单导入 ---------- */
console.log('=== 1. 酷狗歌单导入 ===')
const kgIdx = api.indexOf("platform === 'kg'") >= 0 ? api.indexOf("platform === 'kg'") : api.indexOf('kugou')
if (kgIdx > 0) {
  const seg = api.slice(Math.max(0, kgIdx - 200), kgIdx + 1500)
  seg.split('\n').forEach((l, i) => {
    if (l.trim()) console.log('  ' + l.trim().slice(0, 110))
  })
} else {
  console.log('  未找到 kg 分支')
}

/* 检查 parsePlaylistUrl 是否支持酷狗链接格式 */
console.log('\n=== parsePlaylistUrl 支持的格式 ===')
const pi = api.indexOf('function parsePlaylistUrl')
if (pi > 0) console.log(api.slice(pi, pi + 900))

/* ---------- 2. 返回导航 ---------- */
console.log('\n\n=== 2. 返回导航 ===')
const navKeys = ['btnNavBack', 'navGo', 'navHistory', 'history.push', 'breadcrumb', 'back-btn', '返回']
navKeys.forEach((k) => {
  const n = (app.match(new RegExp(k, 'g')) || []).length
  const h = (html.match(new RegExp(k, 'g')) || []).length
  console.log('  ' + k.padEnd(16) + 'app.js ' + n + ' 处 | index.html ' + h + ' 处')
})

/* 移动端顶栏是否有返回按钮 */
console.log('\n=== 移动端顶栏结构 ===')
const topbar = html.match(/<header class="topbar">[\s\S]*?<\/header>/)
if (topbar) {
  const ids = [...topbar[0].matchAll(/id="([^"]+)"/g)].map((m) => m[1])
  console.log('  按钮 id: ' + ids.join(', '))
  console.log('  含 nav-history: ' + topbar[0].includes('nav-history'))
}

/* navGo / navPush 实现 */
console.log('\n=== navGo 实现 ===')
const ni = app.indexOf('function navGo')
if (ni > 0) console.log(app.slice(ni, ni + 700))

/* ---------- 3. 推荐歌单不显示 ---------- */
console.log('\n\n=== 3. 推荐歌单 ===')
const ri = app.indexOf('function renderRecommendView')
if (ri > 0) {
  const seg = app.slice(ri, ri + 1800)
  seg.split('\n').forEach((l) => {
    const t = l.trim()
    if (/panelList|innerHTML|rec-grid|rec-card|api\(|discover|catch|error|empty/.test(t)) console.log('  ' + t.slice(0, 110))
  })
}

/* 手机端 discover 接口 */
console.log('\n=== 手机端 /api/discover ===')
const di = api.indexOf("'/api/discover'")
if (di > 0) console.log(api.slice(di, di + 800))
