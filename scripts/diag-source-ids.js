'use strict'
/* 核心问题排查：PRIO 里的 7 个 id 是否真的在 sources-data.js 里 */
const fs = require('node:fs')

const sd = fs.readFileSync('mobile/www/sources-data.js', 'utf8')
const eng = fs.readFileSync('mobile/www/lib/lx-engine-web.js', 'utf8')

const prio = ['dujia6', 'kxh', 'xingkong', 'yuxi', 'changqing2', 'fish', 'freelisten']

console.log('=== PRIO 的 7 个 id 在 sources-data.js 里是否存在 ===')
for (const id of prio) {
  const re = new RegExp('["\']?' + id + '["\']?\\s*:', 'g')
  const n = (sd.match(re) || []).length
  const re2 = new RegExp('\\b' + id + '\\b', 'g')
  const n2 = (sd.match(re2) || []).length
  console.log('  ' + id.padEnd(14) + ' 键出现 ' + n + ' 次 | 词出现 ' + n2 + ' 次 ' + (n2 ? '' : '  ← 不存在！'))
}

console.log('\n=== sources-data.js 的数据结构（前 600 字符）===')
console.log(sd.slice(0, 600))

console.log('\n=== 引擎怎么取音源 ===')
const idx = eng.indexOf('__SOURCES__') >= 0 ? eng.indexOf('__SOURCES__') : 0
const keys = ['__SOURCES__', 'sources-data', 'SOURCES', 'getScript', 'scripts[']
for (const k of keys) {
  const i = eng.indexOf(k)
  if (i > 0) {
    console.log('\n  [' + k + '] 位置 ' + i)
    console.log('  ' + eng.slice(Math.max(0, i - 100), i + 250).replace(/\n/g, '\n  '))
  }
}
