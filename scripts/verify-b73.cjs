'use strict'
/* 确认 B73 已生效 */
process.chdir(require('node:path').resolve(__dirname, '..'))
const fs = require('node:fs')
const s = fs.readFileSync('mobile/www/api-mobile.js', 'utf8')

const i = s.indexOf("'/api/sources'")
const seg = s.slice(i, i + 1600)
console.log('/api/sources 段内是否含 ensureScripts:', seg.includes('ensureScripts') ? '✓' : '✗')
console.log('是否含 Promise.race:', seg.includes('Promise.race') ? '✓' : '✗')

const j = seg.indexOf('ensureScripts')
if (j > 0) console.log('\n上下文:\n' + seg.slice(Math.max(0, j - 200), j + 200))
