'use strict'
/* 检查 B73 与音源面板的加载 */
process.chdir(require('node:path').resolve(__dirname, '..'))
const fs = require('node:fs')
const s = fs.readFileSync('mobile/www/api-mobile.js', 'utf8')

const i = s.indexOf("'/api/sources'")
console.log('/api/sources 位置: ' + i)
if (i > 0) {
  console.log(s.slice(Math.max(0, i - 100), i + 1200))
}

console.log('\n--- ensureScripts 定义 ---')
const j = s.indexOf('function ensureScripts')
if (j > 0) console.log(s.slice(j, j + 500))

console.log('\n--- ensureScripts 调用点 ---')
const lines = s.split('\n')
lines.forEach((l, idx) => {
  if (l.includes('ensureScripts')) console.log('  L' + (idx + 1) + ': ' + l.trim().slice(0, 100))
})
