'use strict'
/* 检查 B18 注入现场 */
const fs = require('node:fs')
const s = fs.readFileSync('mobile/www/api-mobile.js', 'utf8')

const i = s.indexOf('B18')
console.log('B18 位置: ' + i)
if (i > 0) {
  console.log('=== B18 注入处上下文（前 200 / 后 1200）===')
  console.log(s.slice(Math.max(0, i - 200), i))
  console.log('--- 注入内容开始 ---')
  console.log(s.slice(i, i + 1200))
}

const j = s.indexOf("'/api/url'")
console.log('\n\n/api/url 分支位置: ' + j)
if (j > 0) {
  console.log(s.slice(j - 60, j + 900))
}
