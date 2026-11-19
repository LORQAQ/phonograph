'use strict'
/* 检查 B47 与 B39（用英文变量名避免 CJK 标识符问题） */
const path = require('node:path')
process.chdir(path.resolve(__dirname, '..'))
const fs = require('node:fs')
const s = fs.readFileSync('app/server.js', 'utf8')

console.log('=== B47 ===')
const nested = s.match(/cacheGet\(urlCache,\s*cacheGet\([^)]*\)\)/g)
console.log('nested cacheGet:', nested ? 'BAD ' + nested.length : 'ok none')
const remainGet = (s.match(/urlCache\.get\(/g) || []).length
console.log('remaining urlCache.get:', remainGet)
const calls = (s.match(/cacheGet\(urlCache,/g) || []).length
console.log('cacheGet calls:', calls)
const sets = (s.match(/cacheSet\(urlCache,/g) || []).length
console.log('cacheSet calls:', sets)

const i = s.indexOf('cacheGet(urlCache,')
if (i > 0) {
  console.log('\nfirst call context:')
  console.log(s.slice(Math.max(0, i - 180), i + 220))
}

console.log('\n=== B39 discover ===')
const j = s.indexOf("/api/discover")
if (j > 0) console.log(s.slice(j, j + 600))
