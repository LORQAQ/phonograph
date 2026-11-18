'use strict'
/* 检查 HTML 缺哪些 app.js 需要的容器，并补回去 */
const fs = require('node:fs')

const html = fs.readFileSync('public/index.html', 'utf8')
const a = fs.readFileSync('public/app.js', 'utf8')

const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]))
console.log('HTML 有 ' + ids.size + ' 个 id')

/* app.js 引用的所有 id */
const used = new Set()
for (const m of a.matchAll(/\$\('#([\w-]+)'\)/g)) used.add(m[1])
console.log('app.js 引用 ' + used.size + ' 个 id')

const missing = [...used].filter((x) => !ids.has(x))
console.log('\n缺失 ' + missing.length + ' 个:')
missing.forEach((x) => console.log('  #' + x))

/* 找出 panel-body / main 结构 */
console.log('\n=== HTML 主区域结构 ===')
const panelIdx = html.indexOf('panelList')
if (panelIdx > 0) {
  console.log(html.slice(Math.max(0, panelIdx - 500), panelIdx + 200))
}

/* 检查是否有这些语义容器 */
console.log('\n=== 语义容器存在性 ===')
for (const k of ['recGrid', 'newList', 'leaderBody', 'recCount', 'btnMoreRec', 'backToColl', 'importUrl', 'speedResult', 'qqCookie', 'dlDir', 'lrcOffsetTip', 'btnPreviewImport']) {
  console.log('  ' + k.padEnd(20) + (ids.has(k) ? '✓' : '✗'))
}
