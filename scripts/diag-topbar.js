'use strict'
/* 定位：问号元素 + 搜索框在窄屏的表现 */
const fs = require('node:fs')

const html = fs.readFileSync('public/index.html', 'utf8')
const css = fs.readFileSync('public/style.css', 'utf8')

console.log('=== 可能是问号的元素 ===')
const lines = html.split('\n')
lines.forEach((l, i) => {
  if (l.includes('>?<') || /btnHelp|help|title="[^"]*帮助/.test(l)) {
    console.log((i + 1) + ': ' + l.trim().slice(0, 130))
  }
})

console.log('\n=== 顶栏里的所有元素 ===')
const topStart = html.indexOf('<header class="topbar">')
const topEnd = html.indexOf('</header>', topStart)
const topbar = html.slice(topStart, topEnd + 9)
const tags = [...topbar.matchAll(/<(div|button|input|select|svg)[^>]*class="([^"]*)"/g)]
tags.forEach((m) => console.log('  <' + m[1] + ' class="' + m[2] + '">'))
const ids = [...topbar.matchAll(/id="([^"]+)"/g)].map((m) => m[1])
console.log('  ids: ' + ids.join(', '))

console.log('\n=== 媒体查询 ===')
const mq = [...css.matchAll(/@media[^{]+/g)].map((x) => x[0].trim())
console.log(mq.length + ' 个:')
mq.slice(0, 12).forEach((x) => console.log('  ' + x))

console.log('\n=== .search-wrap 规则 ===')
const sw = css.match(/\.search-wrap[^{]*\{[^}]*\}/g) || []
sw.slice(0, 5).forEach((x) => console.log('  ' + x.replace(/\s+/g, ' ').slice(0, 140)))

console.log('\n=== #searchInput 规则 ===')
const si = css.match(/#searchInput[^{]*\{[^}]*\}/g) || []
si.slice(0, 4).forEach((x) => console.log('  ' + x.replace(/\s+/g, ' ').slice(0, 140)))

console.log('\n=== .topbar 规则 ===')
const tb = css.match(/\.topbar\s*\{[^}]*\}/g) || []
tb.slice(0, 3).forEach((x) => console.log('  ' + x.replace(/\s+/g, ' ').slice(0, 200)))
