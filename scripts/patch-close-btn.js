'use strict'
/* 关闭按钮：去掉旧定义冲突，放大点击区域，确保能点到 */
const fs = require('node:fs')
let s = fs.readFileSync('public/style.css', 'utf8')

/* 1) 删掉最早的 .close-lyric 定义（与歌词层新样式冲突） */
s = s.replace(
  '.close-lyric{position:absolute;right:20px;top:16px;width:30px;height:30px;border-radius:3px;color:var(--text-2',
  '.close-lyric-legacy{display:none}/*'
)
/* 把那条旧规则的剩余部分注释掉到行末 */
s = s.replace(/\.close-lyric-legacy\{display:none\}\/\*.*?\*\//s, '.close-lyric-legacy{display:none}')
s = s.replace('.close-lyric:hover{background:var(--bg-hover);color:var(--text)}', '')

/* 2) 统一歌词层关闭按钮：44x44 触摸区，最高层级 */
const unified = `
/* 关闭按钮（唯一有效定义） */
.lyric-layer .close-lyric{
  position:absolute !important;
  top:16px !important;right:16px !important;
  width:44px !important;height:44px !important;
  display:flex !important;align-items:center !important;justify-content:center !important;
  font-size:22px !important;line-height:1 !important;
  border-radius:50% !important;
  background:rgba(255,255,255,.14) !important;
  border:1px solid rgba(255,255,255,.3) !important;
  color:#fff !important;
  cursor:pointer !important;
  z-index:30 !important;
  padding:0 !important;
}
.lyric-layer .close-lyric:hover,
.lyric-layer .close-lyric:active{background:rgba(255,255,255,.26) !important}
`

if (!s.includes('关闭按钮（唯一有效定义）')) {
  s += unified
}

fs.writeFileSync('public/style.css', s, 'utf8')
console.log('旧定义已注释:', !s.includes('position:absolute;right:20px;top:16px;width:30px'))
console.log('新定义:', s.includes('关闭按钮（唯一有效定义）'))
