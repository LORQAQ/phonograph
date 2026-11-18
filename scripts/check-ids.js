'use strict'
/* 找出 app.js 里引用了但 index.html 不存在的 id，定位 boot 中断原因 */
const fs = require('node:fs')
const app = fs.readFileSync('public/app.js', 'utf8')
const html = fs.readFileSync('public/index.html', 'utf8')

const htmlIds = new Set()
for (const m of html.matchAll(/id="([^"]+)"/g)) htmlIds.add(m[1])

/* 动态渲染的 id（在 app.js 的模板字符串里出现 id="xxx"）也算存在 */
const dynamicIds = new Set()
for (const m of app.matchAll(/id="([^"]+)"/g)) dynamicIds.add(m[1])

const refs = new Map()
for (const m of app.matchAll(/\$\('#([A-Za-z0-9_-]+)'\)/g)) {
  const id = m[1]
  const line = app.slice(0, m.index).split('\n').length
  if (!refs.has(id)) refs.set(id, [])
  refs.get(id).push(line)
}

const missing = []
for (const [id, lines] of refs) {
  if (!htmlIds.has(id) && !dynamicIds.has(id)) {
    missing.push({ id, lines: lines.slice(0, 3) })
  }
}

if (missing.length) {
  console.log('引用了但页面里没有的 id（会导致 null.onclick 报错）：')
  missing.forEach((x) => console.log('  #' + x.id + '  ← app.js 第 ' + x.lines.join(', ') + ' 行'))
} else {
  console.log('所有 id 引用都能在页面里找到')
}

/* 另外检查 remove 掉的 rail-head */
console.log('\nrail-head 引用:', (app.match(/rail-head/g) || []).length, '处')
console.log('btnNewPlaylist2 引用:', (app.match(/btnNewPlaylist2/g) || []).length, '处')
