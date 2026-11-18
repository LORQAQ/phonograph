'use strict'
/* 找界面上那个孤零零的 ? 是哪来的 */
const fs = require('node:fs')

const js = fs.readFileSync('public/app.js', 'utf8')
const html = fs.readFileSync('public/index.html', 'utf8')
const css = fs.readFileSync('public/style.css', 'utf8')

console.log('=== 1. HTML 里带 ? 的元素 ===')
const lines = html.split('\n')
lines.forEach((l, i) => {
  if (/\?/.test(l) && !/href|src=|<\?|<!--/.test(l)) {
    console.log((i + 1) + ': ' + l.trim().slice(0, 130))
  }
})

console.log('\n=== 2. app.js 里写入 ? 的地方 ===')
const jlines = js.split('\n')
jlines.forEach((l, i) => {
  /* 找 textContent/innerHTML 赋值里出现独立 ? 的 */
  if (/(textContent|innerHTML|title)\s*=\s*['"`][^'"`]*\?/.test(l)) {
    console.log((i + 1) + ': ' + l.trim().slice(0, 130))
  }
})

console.log('\n=== 3. app.js 里的 ? 三元判断(排除)后剩余 ===')
let hits = 0
jlines.forEach((l, i) => {
  if (/'[^']*\?[^']*'/.test(l) && !/\?[^:]*:/.test(l)) {
    console.log((i + 1) + ': ' + l.trim().slice(0, 120))
    hits++
  }
})
if (!hits) console.log('  无')

console.log('\n=== 4. CSS 里的 content: "?" ===')
const c = css.match(/content:\s*['"]\?['"]/g)
console.log(c ? c.join(', ') : '  无')

console.log('\n=== 5. HTML 中 __errBar / 调试相关 ===')
lines.forEach((l, i) => {
  if (/__errBar|__errs|debug|help/i.test(l)) {
    console.log((i + 1) + ': ' + l.trim().slice(0, 120))
  }
})

console.log('\n=== 6. 顶栏最后的按钮 ===')
const topStart = html.indexOf('<header class="topbar">')
const topEnd = html.indexOf('</header>', topStart)
const topbar = html.slice(topStart, topEnd)
const btns = [...topbar.matchAll(/<button[^>]*id="([^"]+)"[^>]*>([\s\S]{0,60}?)<\/button>/g)]
btns.forEach((m) => console.log('  #' + m[1] + ' -> ' + m[2].replace(/\s+/g, ' ').trim().slice(0, 60)))
