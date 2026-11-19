'use strict'
/* P0: $(sel).forEach → $$(sel).forEach */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))
const p = 'public/app.js'
let s = fs.readFileSync(p, 'utf8')

const DOLLAR = String.fromCharCode(36)          /* $ */
const TWO = DOLLAR + DOLLAR                     /* $$ */

const targets = [
  DOLLAR + "('.song-list tbody tr').forEach",
  DOLLAR + "('.dl-fmt').forEach",
]

let total = 0
for (const t of targets) {
  const fixed = TWO + t.slice(1)
  const cnt = s.split(t).length - 1
  if (cnt > 0) {
    s = s.split(t).join(fixed)
    total += cnt
    console.log('替换 ' + cnt + ' 处: ' + t)
  }
}

fs.writeFileSync(p, s, 'utf8')
console.log('共 ' + total + ' 处')

/* 验证 */
const lines = fs.readFileSync(p, 'utf8').split('\n')
;['.song-list tbody tr', '.dl-fmt'].forEach((sel) => {
  lines.forEach((l, i) => {
    if (l.includes(sel) && l.includes('.forEach')) {
      const bad = l.includes(DOLLAR + '(' + "'" + sel) || l.includes(DOLLAR + '("' + sel)
      console.log('  L' + (i + 1) + ': ' + (bad ? '✗ 还是单 $' : '✓') + '  ' + l.trim().slice(0, 80))
    }
  })
})
