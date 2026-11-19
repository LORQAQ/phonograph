'use strict'
/* 检查 B47 替换是否产生嵌套，以及 B39 discover */
const path = require('node:path')
process.chdir(path.resolve(__dirname, '..'))
const fs = require('node:fs')
const s = fs.readFileSync('app/server.js', 'utf8')

console.log('=== B47 检查 ===')
/* 找嵌套 cacheGet */
const nested = s.match(/cacheGet\(urlCache,\s*cacheGet\([^)]*\)\)/g)
console.log('嵌套 cacheGet:', nested ? '✗ ' + nested.length + ' 处' : '✓ 无')
/* 找残留的 urlCache.get */
const残留 = (s.match(/urlCache\.get\(/g) || []).length
console.log('残留 urlCache.get:', 残留)
/* 找 cacheGet 调用 */
const calls = (s.match(/cacheGet\(urlCache,/g) || []).length
console.log('cacheGet 调用:', calls + ' 处')
const sets = (s.match(/cacheSet\(urlCache,/g) || []).length
console.log('cacheSet 调用:', sets + ' 处')

/* 打印一个 cacheGet 调用上下文 */
const i = s.indexOf('cacheGet(urlCache,')
if (i > 0) console.log('\n第一处:\n' + s.slice(Math.max(0, i - 150), i + 200))

console.log('\n=== B39 discover ===')
const j = s.indexOf('/api/discover')
if (j > 0) console.log(s.slice(j, j + 500))
