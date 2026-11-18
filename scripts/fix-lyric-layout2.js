'use strict'
/* 歌词页排版：整体居中、间距平衡；工具条已删除，控制条保留在底部 */
const fs = require('node:fs')
let s = fs.readFileSync('public/style.css', 'utf8')

const css = `
/* ===== 歌词页排版修正（覆盖历史规则） ===== */
.lyric-layer .lyric-panel{
  display:flex !important;
  align-items:center !important;
  justify-content:center !important;
  gap:64px !important;
  padding:64px 72px 150px !important;
  box-sizing:border-box !important;
  max-width:1180px !important;
  margin:0 auto !important;
  left:0 !important;right:0 !important;
}
.lyric-layer .lyric-head{
  flex:0 0 300px !important;
  max-width:300px !important;
  display:flex !important;
  flex-direction:column !important;
  align-items:center !important;
  text-align:center !important;
}
.lyric-layer .lyric-head .disc{width:200px !important;height:200px !important;margin:0 0 22px !important}
.lyric-layer #lyricName{font-size:21px !important;margin:0 0 6px !important;text-align:center !important}
.lyric-layer #lyricSinger{font-size:13px !important;text-align:center !important}
.lyric-layer .lyric-scroll{
  flex:0 1 560px !important;
  max-width:560px !important;
  max-height:calc(100vh - 260px) !important;
  overflow-y:auto !important;
  text-align:center !important;
}
.lyric-layer .lyric-line{text-align:center !important;padding:4px 0 !important}
.lyric-layer .lyric-ctrl{bottom:44px !important}

@media (max-width:860px){
  .lyric-layer .lyric-panel{
    flex-direction:column !important;
    justify-content:flex-start !important;
    align-items:center !important;
    gap:16px !important;
    padding:64px 20px 130px !important;
    max-width:100% !important;
  }
  .lyric-layer .lyric-head{flex:0 0 auto !important;max-width:100% !important}
  .lyric-layer .lyric-head .disc{width:96px !important;height:96px !important;margin-bottom:12px !important}
  .lyric-layer #lyricName{font-size:17px !important}
  .lyric-layer .lyric-scroll{flex:1 1 auto !important;max-width:100% !important;width:100% !important;text-align:left !important}
  .lyric-layer .lyric-line{text-align:left !important;font-size:16px !important;padding:3px 0 !important}
  .lyric-layer .lyric-ctrl{bottom:34px !important}
}
`

if (!s.includes('歌词页排版修正')) {
  s += css
  fs.writeFileSync('public/style.css', s, 'utf8')
  console.log('歌词页排版已修正')
} else {
  console.log('已存在')
}
