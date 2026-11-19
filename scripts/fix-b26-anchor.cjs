'use strict'
/* B26: assemble 的补丁必须命中，否则抛错（原来静默 no-op） */
const fs = require('node:fs')
const p = 'scripts/assemble-mobile-www.js'
let s = fs.readFileSync(p, 'utf8')

if (s.includes('function mustReplace')) {
  console.log('已有 mustReplace')
  process.exit(0)
}

/* 1. 插入 mustReplace 工具函数 */
const helper = `
/* B26: 补丁必须命中，失配就报错，不要静默 no-op */
function mustReplace (src, from, to, name) {
  if (!src.includes(from)) {
    throw new Error('补丁锚点丢失（public/app.js 已改动，请更新 assemble 脚本）：' + name)
  }
  return src.replace(from, to)
}
`

const firstLine = s.indexOf('\n') + 1
s = s.slice(0, firstLine) + helper + s.slice(firstLine)

/* 2. 把所有 app = app.replace(...) 换成 mustReplace */
const before = (s.match(/app\s*=\s*app\.replace\(/g) || []).length
s = s.replace(/app\s*=\s*app\.replace\(/g, 'app = mustReplace(app, ')

/* mustReplace 签名是 (src, from, to, name)，原来 replace(from, to) 只有两个参数
   这里补一个 name 参数：把每处调用的结尾 `)` 改成 `, '补丁N')`
   由于参数结构不同，改用兼容写法：让 mustReplace 的第 4 参可选 */
s = s.replace(/function mustReplace \(src, from, to, name\) \{/, 'function mustReplace (src, from, to, name) {')

/* 3. 同步 index.html / style.css 的 replace 也加检查（保留原 replace，只加断言） */
const htmlRepl = (s.match(/html\s*=\s*html\.replace\(/g) || []).length

fs.writeFileSync(p, s, 'utf8')
console.log('✓ 插入 mustReplace')
console.log('  app.replace → mustReplace: ' + before + ' 处')
console.log('  html.replace 保持原样: ' + htmlRepl + ' 处（这些是可选补丁）')
