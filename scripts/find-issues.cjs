'use strict'
/* 定位 $ 当 $$ 误用 + btnRecImport 未绑原因 */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

const s = fs.readFileSync('public/app.js', 'utf8')
const D = String.fromCharCode(36)          /* $ */
const DD = D + D                            /* $$ */

console.log('=== $(...) .forEach 误用扫描 ===')
const lines = s.split('\n')
let hit = 0
for (let i = 0; i < lines.length; i++) {
  const l = lines[i]
  if (!l.includes('.forEach')) continue
  /* 找 $(' 或 $(" 出现的位置，且前面不是 $ */
  for (const q of ["'" + '', '"']) { /* 占位 */ }
  const m1 = l.match(/(^|[^$])\$\(['"][^'"]*['"]\)\.forEach/)
  const m2 = l.match(/(^|[^$])\$\(['"][^'"]*['"]\)\.forEach/)
  if (m1 || m2) {
    hit++
    console.log('  L' + (i + 1) + ': ' + l.trim().slice(0, 120))
  }
}
if (!hit) console.log('  无（我的扫描漏了？）')

/* 用更笨但可靠的办法：逐字符找 */
console.log('\n=== 逐字符扫描 ===')
for (let i = 0; i < lines.length; i++) {
  const l = lines[i]
  const idx = l.indexOf('.forEach')
  if (idx < 0) continue
  /* 往前找 $ 序列 */
  let j = idx - 1
  let depth = 0
  while (j >= 0 && idx - j < 80) {
    const ch = l[j]
    if (ch === ')') depth++
    else if (ch === '(') {
      depth--
      if (depth === 0) break
    }
    j--
  }
  if (j > 0) {
    const before = l.slice(Math.max(0, j - 3), j + 1)
    const cnt = (before.match(/\$/g) || []).length
    if (cnt === 1) {
      console.log('  L' + (i + 1) + ': ' + l.trim().slice(0, 120))
    }
  }
}

console.log('\n=== btnRecImport ===')
const bi = s.indexOf('btnRecImport')
console.log('btnRecImport @' + bi)
lines.forEach((l, i) => { if (l.includes('btnRecImport')) console.log('  L' + (i + 1) + ': ' + l.trim().slice(0, 100)) })

console.log('\n=== openRecDialog ===')
const od = s.indexOf('openRecDialog')
console.log('openRecDialog @' + od)
if (od > 0) {
  const bs = s.indexOf('{', od)
  console.log(s.slice(bs, bs + 800))
}
