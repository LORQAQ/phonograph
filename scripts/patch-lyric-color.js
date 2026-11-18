'use strict'
/* 歌词文字颜色跟随主题，修复亮色主题下"看不见歌词" */
const fs = require('node:fs')

let s = fs.readFileSync('public/style.css', 'utf8')

/* 右侧面板滚动歌词 */
s = s.replace(
  '.lyric-roll .ll{font-size:clamp(12px,1vw,14.5px);color:rgba(239,231,218,.32);line-height:2.2;padding:1px 10px;transition:color .18s;cursor:pointer}',
  '.lyric-roll .ll{font-size:clamp(12px,1vw,14.5px);color:var(--text);opacity:.42;line-height:2.2;padding:1px 10px;transition:color .18s,opacity .18s;cursor:pointer}\n.lyric-roll .ll:hover{opacity:.72}'
)
s = s.split('.lyric-roll .ll.active{color:var(--brass)}').join('.lyric-roll .ll.active{color:var(--accent);opacity:1}')

/* 全屏歌词页 */
s = s.split('.lyric-line{font-family:var(--serif);font-size:16px;color:rgba(239,231,218,.28);line-height:2.4;cursor:pointer;padding:0 8px;transition:color .18s,font-size .18s}').join(
  '.lyric-line{font-family:var(--serif);font-size:16px;color:var(--text);opacity:.38;line-height:2.4;cursor:pointer;padding:0 8px;transition:color .18s,opacity .18s,font-size .18s}'
)
s = s.split('.lyric-line:hover{color:rgba(239,231,218,.55)}').join('.lyric-line:hover{opacity:.7}')
s = s.split('.lyric-line.active{color:var(--brass);font-size:19px}').join('.lyric-line.active{color:var(--accent);opacity:1;font-size:19px;font-weight:600}')

/* 空歌词/提示文字也用主题色 */
s = s.split('.lyric-empty{color:var(--text-3);text-align:center;padding:30px 0}').join('.lyric-empty{color:var(--text-3);text-align:center;padding:30px 0;font-size:13px}')

fs.writeFileSync('public/style.css', s, 'utf8')

const ok = !s.includes('rgba(239,231,218')
console.log('歌词颜色已变量化:', ok)
console.log('剩余硬编码:', (s.match(/rgba\(239,231,218/g) || []).length)

/* 歌词页背景也跟随主题 */
if (s.includes('.lyric-layer{position:fixed;inset:0;z-index:110;display:none;background:#080706')) {
  s = s.replace('.lyric-layer{position:fixed;inset:0;z-index:110;display:none;background:#080706', '.lyric-layer{position:fixed;inset:0;z-index:110;display:none;background:var(--bg)')
  fs.writeFileSync('public/style.css', s, 'utf8')
  console.log('歌词页背景已变量化')
}
