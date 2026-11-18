'use strict'
/* 歌词页是深色玻璃背景，文字要用固定浅色 + 足够对比度 */
const fs = require('node:fs')
let s = fs.readFileSync('public/style.css', 'utf8')

/* 1) 歌词行：固定浅白，基础透明度提到 0.55 */
s = s.replace(
  '.lyric-line{font-family:var(--serif);font-size:16px;color:var(--text);opacity:.38;line-height:2.4;cursor:pointer;padding:0 8px;transition:color .18s,opacity .18s,font-size .18s}',
  '.lyric-line{font-family:var(--serif);font-size:16px;color:rgba(255,255,255,.56);line-height:2.4;cursor:pointer;padding:2px 8px;transition:color .18s,opacity .18s,font-size .18s;text-shadow:0 1px 3px rgba(0,0,0,.45)}'
)
s = s.replace('.lyric-line:hover{opacity:.7}', '.lyric-line:hover{color:rgba(255,255,255,.85)}')
s = s.replace(
  '.lyric-line.active{color:var(--accent);opacity:1;font-size:19px;font-weight:600}',
  '.lyric-line.active{color:var(--accent);font-size:19px;font-weight:700;text-shadow:0 1px 6px rgba(0,0,0,.6)}'
)

/* 2) 背景加深，避免封面模糊把文字吃掉 */
s = s.replace(
  '.lyric-layer{position:fixed;inset:0;z-index:110;display:none;background:var(--panel-b);align-items:center',
  '.lyric-layer{position:fixed;inset:0;z-index:110;display:none;background:var(--panel-b);align-items:center'
)

/* 3) 遮挡层：在歌词层底部加 55% 黑遮罩提升对比 */
if (!s.includes('.lyric-layer::before')) {
  s = s.replace(
    '.lyric-layer.show{display:flex}',
    '.lyric-layer.show{display:flex}\n.lyric-layer::before{content:"";position:absolute;inset:0;background:rgba(0,0,0,.52);pointer-events:none;z-index:0}\n.lyric-layer>*{position:relative;z-index:1}'
  )
}

fs.writeFileSync('public/style.css', s, 'utf8')
console.log('歌词行已改浅白:', s.includes('rgba(255,255,255,.56)'))
console.log('遮罩层:', s.includes('.lyric-layer::before'))
