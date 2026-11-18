'use strict'
/* 降低歌词页遮罩，让专辑背景透出来 */
const fs = require('node:fs')
const p = 'mobile/www/style.css'
let c = fs.readFileSync(p, 'utf8')

const re = /\.lyric-layer::before\{[^}]*\}/
const before = (c.match(re) || [''])[0]
console.log('修改前:\n' + before)

const replacement = '.lyric-layer::before{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(6,5,4,.38) 0%,rgba(6,5,4,.76) 100%);pointer-events:none;z-index:0}'

if (re.test(c)) {
  c = c.replace(re, replacement)
  fs.writeFileSync(p, c, 'utf8')
  console.log('\n修改后:\n' + (c.match(re) || [''])[0])
} else {
  console.log('未找到遮罩规则')
}
