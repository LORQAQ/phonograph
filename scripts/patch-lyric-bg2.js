'use strict'
/* 再压一层：遮罩加深、背景图更弱、翻译行提亮 */
const fs = require('node:fs')
let s = fs.readFileSync('public/style.css', 'utf8')

s = s.replace('background:rgba(8,6,5,.66)', 'background:rgba(6,5,4,.82)')
s = s.replace('.lyric-layer .lyric-bg{opacity:.28 !important;filter:blur(6px) !important}', '.lyric-layer .lyric-bg{opacity:.14 !important;filter:blur(14px) !important}')

/* 翻译/副行 */
s += `
.lyric-layer .lyric-line span,
.lyric-layer .lyric-line .tr,
.lyric-layer .lyric-line small{
  color:rgba(255,255,255,.46) !important;
  font-size:.82em !important;
  text-shadow:0 1px 4px rgba(0,0,0,.7);
}
.lyric-layer .lyric-line.active span,
.lyric-layer .lyric-line.active .tr,
.lyric-layer .lyric-line.active small{
  color:rgba(255,255,255,.66) !important;
}
`

fs.writeFileSync('public/style.css', s, 'utf8')
console.log('遮罩 .82:', s.includes('rgba(6,5,4,.82)'), '| bg .14:', s.includes('opacity:.14'))
