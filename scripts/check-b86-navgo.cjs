'use strict'
/* 检查 B86 第二处 + navGo */
process.chdir(require('node:path').resolve(__dirname, '..'))
const fs = require('node:fs')
const s = fs.readFileSync('public/app.js', 'utf8')

const hits = []
let idx = 0
while ((idx = s.indexOf('renderList', idx)) > 0) {
  const line = s.slice(0, idx).split('\n').length
  const ls = s.lastIndexOf('\n', idx) + 1
  const le = s.indexOf('\n', idx)
  hits.push({ line, text: s.slice(ls, le).trim().slice(0, 110) })
  idx += 10
}
console.log('renderList 出现 ' + hits.length + ' 处:')
hits.forEach((h) => console.log('  L' + h.line + ': ' + h.text))

console.log('\nnavGo downloads:', s.includes("e.view === 'downloads'") ? '✓' : '✗')

/* 找 navGo 的 if 链 */
const ni = s.indexOf('function navGo')
if (ni > 0) {
  const seg = s.slice(ni, ni + 900)
  console.log('\nnavGo 分支:')
  seg.split('\n').forEach((l) => {
    const t = l.trim()
    if (t.startsWith('if (e.view') || t.startsWith('else if (e.view') || t.includes('renderDownloadsView')) {
      console.log('  ' + t.slice(0, 90))
    }
  })
}
