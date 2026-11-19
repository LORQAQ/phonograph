'use strict'
/* 查顶栏按钮的可点击性：有没有元素遮挡、pointer-events 是否正常 */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

const css = fs.readFileSync('public/style.css', 'utf8')
const h = fs.readFileSync('public/index.html', 'utf8')

console.log('=== 顶栏 DOM 结构 ===')
const i = h.indexOf('btnOpenSources')
if (i > 0) {
  const ls = h.lastIndexOf('<header', i)
  const le = h.indexOf('</header>', i)
  console.log(h.slice(Math.max(0, ls), le + 9))
}

console.log('\n=== .top-btn 样式 ===')
const re = /\.top-btn[^{]*\{[^}]*\}/g
let m
while ((m = re.exec(css))) console.log('  ' + m[0].replace(/\s+/g, ' ').slice(0, 200))

console.log('\n=== pointer-events 相关 ===')
const pe = []
css.split('\n').forEach((l, n) => {
  if (l.includes('pointer-events')) pe.push('  L' + (n + 1) + ': ' + l.trim().slice(0, 100))
})
console.log(pe.length ? pe.join('\n') : '  无')

console.log('\n=== 可能遮挡的元素（fixed/absolute + 高 z-index） ===')
const blocks = css.match(/[^{}]*\{[^}]*position:\s*(fixed|absolute)[^}]*\}/g) || []
blocks.forEach((b) => {
  const z = b.match(/z-index:\s*(\d+)/)
  if (z && Number(z[1]) > 10) {
    const sel = b.split('{')[0].trim()
    console.log('  ' + sel + '  z-index=' + z[1])
  }
})

console.log('\n=== topbar / header 样式 ===')
;['.topbar', 'header', '.top-nav', '.topbar-right'].forEach((sel) => {
  const idx = css.indexOf(sel + '{')
  if (idx > 0) {
    const end = css.indexOf('}', idx)
    console.log('  ' + css.slice(idx, end + 1).replace(/\s+/g, ' ').slice(0, 180))
  }
})

console.log('\n=== 检查 .top-btn 的兄弟是否有覆盖 ===')
const topBtnIdx = h.indexOf('class="top-btn"')
console.log(h.slice(Math.max(0, topBtnIdx - 300), topBtnIdx + 500))
