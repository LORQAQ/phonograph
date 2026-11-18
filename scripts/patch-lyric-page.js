'use strict'
/* 全屏歌词页：标题/歌手/歌词在深色玻璃上必须清晰 */
const fs = require('node:fs')
let s = fs.readFileSync('public/style.css', 'utf8')

const add = `
/* ===== 全屏歌词页对比度修正 ===== */
.lyric-layer .lyric-head h2,
.lyric-layer #lyricName{
  color:#ffffff !important;
  text-shadow:0 2px 10px rgba(0,0,0,.65);
  font-weight:600;
}
.lyric-layer .lyric-head p,
.lyric-layer #lyricSinger{
  color:rgba(255,255,255,.82) !important;
  text-shadow:0 1px 6px rgba(0,0,0,.6);
}
.lyric-layer .lyric-empty,
.lyric-layer #lyricInner .lyric-empty{
  color:rgba(255,255,255,.72) !important;
}
.lyric-layer .lyric-scroll .lyric-line{
  color:rgba(255,255,255,.58) !important;
}
.lyric-layer .lyric-scroll .lyric-line.active{
  color:var(--accent) !important;
  text-shadow:0 2px 12px rgba(0,0,0,.75);
}
.lyric-layer .lyric-tools,
.lyric-layer .lyric-tools *{
  color:rgba(255,255,255,.8) !important;
}
.lyric-layer .close-lyric{
  color:rgba(255,255,255,.8) !important;
  background:rgba(255,255,255,.1) !important;
  border-color:rgba(255,255,255,.25) !important;
}
`

if (!s.includes('全屏歌词页对比度修正')) {
  s += add
  fs.writeFileSync('public/style.css', s, 'utf8')
  console.log('已追加歌词页对比度规则')
} else {
  console.log('已存在')
}
