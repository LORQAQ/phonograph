'use strict'
/* 歌词页底部布局：工具条与播放控制各自居中，互不遮挡；关闭按钮避开右上角悬浮球 */
const fs = require('node:fs')
let s = fs.readFileSync('public/style.css', 'utf8')

const fix = `
/* ===== 歌词页底部布局（最终版） ===== */
.lyric-layer{display:block !important;overflow:hidden}
.lyric-layer .lyric-panel{
  position:absolute !important;
  inset:0 !important;
  display:flex !important;
  flex-direction:row !important;
  align-items:center !important;
  justify-content:center !important;
  gap:40px !important;
  padding:56px 40px 132px !important;
  box-sizing:border-box !important;
  overflow-y:auto !important;
}
.lyric-layer .lyric-head{flex:0 0 auto !important;max-width:340px !important}
.lyric-layer .lyric-scroll{flex:1 1 auto !important;max-width:560px !important;max-height:none !important}

/* 播放控制：底部居中 */
.lyric-layer .lyric-ctrl{
  position:absolute !important;
  left:50% !important;transform:translateX(-50%) !important;
  bottom:58px !important;
  display:flex !important;align-items:center !important;gap:26px !important;
  z-index:8 !important;
}

/* 工具条：在其下方居中 */
.lyric-layer .lyric-tools{
  position:absolute !important;
  left:50% !important;transform:translateX(-50%) !important;
  bottom:16px !important;
  display:flex !important;align-items:center !important;gap:8px !important;
  z-index:8 !important;
  white-space:nowrap !important;
}

/* 关闭按钮移到左上角，避开模拟器/系统的右上角悬浮球 */
.lyric-layer .close-lyric{
  top:16px !important;right:auto !important;left:16px !important;
}

@media (max-width:860px){
  .lyric-layer .lyric-panel{
    flex-direction:column !important;
    align-items:flex-start !important;
    justify-content:flex-start !important;
    gap:12px !important;
    padding:56px 18px 150px !important;
  }
  .lyric-layer .lyric-head{max-width:100% !important}
  .lyric-layer .lyric-scroll{max-width:100% !important;width:100% !important}
  .lyric-layer .lyric-ctrl{bottom:66px !important;gap:22px !important}
  .lyric-layer .lyric-tools{bottom:14px !important}
}
`

/* 去掉之前追加的重复块，统一用这一份 */
s = s.replace(/\/\* ===== 歌词页播放控制 \+ 竖屏适配 ===== \*\/[\s\S]*?(?=\/\* 关闭按钮（唯一有效定义） \*\/|$)/, '')
s = s.replace(/\/\* ===== 全屏歌词页对比度修正 ===== \*\/[\s\S]*?(?=\.lyric-layer \.lyric-line span|$)/, '')
s = s.replace(/\/\* 关闭按钮（唯一有效定义） \*\/[\s\S]*?(?=\n\/\* ===== 歌词页底部布局|$)/, '')

s += fix
fs.writeFileSync('public/style.css', s, 'utf8')
console.log('底部布局已写入:', s.includes('歌词页底部布局（最终版）'))
