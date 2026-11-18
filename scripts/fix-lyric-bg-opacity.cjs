'use strict'
/* 修正 .lyric-bg 的 opacity（我上一步加了 opacity:0，导致背景看不见） */
const fs = require('node:fs')
const p = 'mobile/www/style.css'
let c = fs.readFileSync(p, 'utf8')

const before = (c.match(/\.lyric-bg\s*\{[^}]*\}/) || [''])[0]
console.log('修改前:\n' + before)

/* 把 opacity: 0 改成 1 */
c = c.replace(/(\.lyric-bg\s*\{[^}]*?)opacity:\s*0\s*;/, '$1opacity: 1;')

const after = (c.match(/\.lyric-bg\s*\{[^}]*\}/) || [''])[0]
console.log('\n修改后:\n' + after)

fs.writeFileSync(p, c, 'utf8')
console.log('\n已写入')
