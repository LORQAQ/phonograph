'use strict'
/* 第四轮 P0：把误用的 $(...) .forEach 改成 $$ */
const path = require('node:path')
process.chdir(path.resolve(__dirname, '..'))
const fs = require('node:fs')
const p = 'public/app.js'
let s = fs.readFileSync(p, 'utf8')

const lines = s.split('\n')
const hits = []
for (let i = 0; i < lines.length; i++) {
  const l = lines[i]
  /* 匹配 $( 单引号选择器 ).forEach  —— $ 后面紧跟 ( 且不是 $$ */
  if (/(^|[^$])\$\('[^']*'\)\.forEach/.test(l) || /(^|[^$])\$\("[^"]*"\)\.forEach/.test(l)) {
    hits.push({ line: i + 1, text: l.trim() })
  }
}

console.log('发现 ' + hits.length + ' 处')
hits.forEach((h) => console.log('  L' + h.line + ': ' + h.text.slice(0, 110)))

/* 替换：$( → $$( 仅在这些行 */
let n = 0
for (const h of hits) {
  const idx = h.line - 1
  const before = lines[idx]
  lines[idx] = before
    .replace(/(^|[^$])\$\('[^']*'\)\.forEach/g, (m, pre) => pre + m.slice(pre.length).replace(/^\$/, '$$'))
    .replace(/(^|[^$])\$\("[^"]*"\)\.forEach/g, (m, pre) => pre + m.slice(pre.length).replace(/^\$/, '$$'))
  if (lines[idx] !== before) n++
}

fs.writeFileSync(p, lines.join('\n'), 'utf8')
console.log('\n✓ 修了 ' + n + ' 处')

/* 验证 */
const check = fs.readFileSync(p, 'utf8')
const remain = []
check.split('\n').forEach((l, i) => {
  if (/(^|[^$])\$\('[^']*'\)\.forEach/.test(l)) remain.push(i + 1)
})
console.log('剩余 ' + remain.length + ' 处' + (remain.length ? ': L' + remain.join(',L') : ' ✓'))
