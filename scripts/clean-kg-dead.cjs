'use strict'
/* 清理 kgGcidPlaylist 分支里 return 之后的死代码 */
const path = require('node:path')
process.chdir(path.resolve(__dirname, '..'))
const fs = require('node:fs')
const p = 'mobile/www/api-mobile.js'
let s = fs.readFileSync(p, 'utf8')

const NL = String.fromCharCode(10)
const marker = 'const r = await kgGcidPlaylist(gid, 2000)'
const i = s.indexOf(marker)
if (i < 0) { console.log('没找到 marker'); process.exit(0) }

const retLine = s.indexOf('return { platform:', i)
const retEnd = s.indexOf(NL, retLine)
console.log('return 行: ' + s.slice(retLine, retEnd).trim().slice(0, 100))

/* 从 return 行之后，到下一个 6 空格缩进的 } */
const after = retEnd + 1
const closeIdx = s.indexOf(NL + '      }', after)
if (closeIdx < 0) { console.log('没找到闭合'); process.exit(1) }

const dead = s.slice(after, closeIdx + 1)
console.log('死代码 ' + (closeIdx - after) + ' 字符')
console.log('前 100: ' + JSON.stringify(dead.slice(0, 100)))

s = s.slice(0, after) + s.slice(closeIdx + 1)
fs.writeFileSync(p, s, 'utf8')
console.log('✓ 已删除')

const check = fs.readFileSync(p, 'utf8')
const j = check.indexOf('if (/^gcid_/i.test(id)')
console.log('\n=== 最终形态 ===')
console.log(check.slice(Math.max(0, j - 60), j + 300))
