'use strict'
/* 修 B75：tx/kg 分支里 `source === 'wy' &&` 恒假 */
const path = require('node:path')
process.chdir(path.resolve(__dirname, '..'))
const fs = require('node:fs')
const p = 'mobile/www/api-mobile.js'
let s = fs.readFileSync(p, 'utf8')

const AMP = String.fromCharCode(38, 38)   /* && */
const Q = String.fromCharCode(39)          /* ' */
const target = '(source === ' + Q + 'wy' + Q + ' ' + AMP + ' NET_WY.newSongs)'

const before = s.split(target).length - 1
s = s.split(target).join('NET_WY.newSongs')
fs.writeFileSync(p, s, 'utf8')

console.log('替换 ' + before + ' 处')
const i = s.indexOf("if (source === 'tx')")
if (i > 0) console.log('\n现场:\n' + s.slice(i, i + 400))
