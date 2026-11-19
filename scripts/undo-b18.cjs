'use strict'
/* 撤销 B18 的破坏性注入，恢复 /api/url 分支结构 */
process.chdir(require('node:path').resolve(__dirname, '..'))
const fs = require('node:fs')
const p = 'mobile/www/api-mobile.js'
let s = fs.readFileSync(p, 'utf8')

const START = '    /* B18: 手机端 /api/url 完全没有缓存'
const END = '      const __job = (async () => {'

const i = s.indexOf(START)
if (i < 0) {
  console.log('没找到注入块')
  process.exit(0)
}
const j = s.indexOf(END, i)
if (j < 0) {
  console.log('没找到注入结尾')
  process.exit(1)
}

const restored = `    if (p === '/api/url') {`
s = s.slice(0, i) + restored + s.slice(j + END.length)

fs.writeFileSync(p, s, 'utf8')
console.log('✓ 已撤销 B18 注入，恢复为 if (p === \'/api/url\') {')
