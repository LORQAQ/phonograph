'use strict'
/* 歌词层背景固定深色：亮色主题下 --panel-b 是浅色，会导致白字看不见 */
const fs = require('node:fs')
let s = fs.readFileSync('public/style.css', 'utf8')

s = s.replace(
  '.lyric-layer{position:fixed;inset:0;z-index:110;display:none;background:var(--panel-b);align-items:center',
  '.lyric-layer{position:fixed;inset:0;z-index:110;display:none;background:#100e0c;align-items:center'
)

/* 遮罩加深 + 封面背景图减弱 */
s = s.replace(
  '.lyric-layer::before{content:"";position:absolute;inset:0;background:rgba(0,0,0,.52);pointer-events:none;z-index:0}',
  '.lyric-layer::before{content:"";position:absolute;inset:0;background:rgba(8,6,5,.66);pointer-events:none;z-index:0}'
)

if (!s.includes('.lyric-layer .lyric-bg{opacity')) {
  s = s.replace(
    '.lyric-layer>*{position:relative;z-index:1}',
    '.lyric-layer>*{position:relative;z-index:1}\n.lyric-layer .lyric-bg{opacity:.28 !important;filter:blur(6px) !important}'
  )
}

fs.writeFileSync('public/style.css', s, 'utf8')
console.log('深色底:', s.includes('background:#100e0c'))
console.log('遮罩:', s.includes('rgba(8,6,5,.66)'))
console.log('bg 图减弱:', s.includes('.lyric-layer .lyric-bg{opacity:.28'))
