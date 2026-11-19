'use strict'
/* 修 $$$ → $$ */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))
const p = 'public/app.js'
let s = fs.readFileSync(p, 'utf8')

const D = String.fromCharCode(36)
const THREE = D + D + D
const TWO = D + D

const cnt = s.split(THREE).length - 1
if (cnt > 0) {
  s = s.split(THREE).join(TWO)
  console.log('把 ' + cnt + ' 处 $$$ 改回 $$')
}
fs.writeFileSync(p, s, 'utf8')

/* 最终验证：所有 .forEach 前面的 $ 个数 */
const lines = fs.readFileSync(p, 'utf8').split('\n')
console.log('\n=== 检查 ===')
lines.forEach((l, i) => {
  const m = l.match(/(\$+)\(['"][^'"]+['"]\)\.forEach/)
  if (m) {
    const n = m[1].length
    console.log('  L' + (i + 1) + ': ' + (n === 2 ? '✓' : '✗ ' + n + ' 个 $') + '  ' + l.trim().slice(0, 80))
  }
})
