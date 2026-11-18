'use strict'
/* 歌词页：修关闭按钮图标、加播放控制、竖屏布局 */
const fs = require('node:fs')

/* ---------- HTML ---------- */
let html = fs.readFileSync('public/index.html', 'utf8')

/* 1) 关闭按钮改成纯文字，避免 svg 图标缺失显示成 "?" */
html = html.replace(
  '<button class="close-lyric" id="closeLyric"><svg><use href="#i-close"/></svg></button>',
  '<button class="close-lyric" id="closeLyric" aria-label="关闭">\u2715</button>'
)

/* 2) 歌词页底部加播放控制 */
if (!html.includes('lyricCtrl')) {
  html = html.replace(
    '<div class="lyric-tools">',
    `<div class="lyric-ctrl" id="lyricCtrl">
      <button id="lyricPrev" aria-label="上一首"><svg><use href="#i-prev"/></svg></button>
      <button id="lyricPlay" class="main" aria-label="播放/暂停"><svg><use href="#i-play"/></svg></button>
      <button id="lyricNext" aria-label="下一首"><svg><use href="#i-next"/></svg></button>
    </div>
    <div class="lyric-tools">`
  )
}
fs.writeFileSync('public/index.html', html, 'utf8')
console.log('HTML 关闭按钮:', html.includes('aria-label="关闭"'), '| 控制条:', html.includes('lyricCtrl'))

/* ---------- JS ---------- */
let app = fs.readFileSync('public/app.js', 'utf8')
if (!app.includes("$('#lyricPlay')")) {
  app = app.replace(
    "  $('#closeLyric').onclick = () => $('#lyricLayer').classList.remove('show')",
    `  $('#closeLyric').onclick = () => $('#lyricLayer').classList.remove('show')
  $('#lyricPrev').onclick = () => playPrev()
  $('#lyricNext').onclick = () => playNext()
  $('#lyricPlay').onclick = () => togglePlay()
  /* 歌词页里的播放图标跟随状态 */
  const syncLyricPlayBtn = () => {
    const b = $('#lyricPlay')
    if (!b) return
    b.querySelector('use').setAttribute('href', audio.paused ? '#i-play' : '#i-pause')
  }
  setInterval(syncLyricPlayBtn, 400)`
  )
}
fs.writeFileSync('public/app.js', app, 'utf8')
console.log('JS 控制绑定:', app.includes("$('#lyricPlay')"))

/* ---------- CSS ---------- */
let css = fs.readFileSync('public/style.css', 'utf8')
css += `
/* ===== 歌词页播放控制 + 竖屏适配 ===== */
.lyric-layer .close-lyric{
  position:absolute;top:18px;right:18px;width:38px;height:38px;
  display:flex;align-items:center;justify-content:center;
  font-size:20px;line-height:1;border-radius:50%;
  background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.28);
  color:#fff;cursor:pointer;z-index:5;
}
.lyric-layer .close-lyric:hover{background:rgba(255,255,255,.22)}

.lyric-ctrl{
  position:absolute;left:50%;transform:translateX(-50%);bottom:74px;
  display:flex;align-items:center;gap:26px;z-index:4;
}
.lyric-ctrl button{
  width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;
  background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.22);color:#fff;cursor:pointer;
  transition:.15s;
}
.lyric-ctrl button svg{width:18px;height:18px;fill:currentColor}
.lyric-ctrl button:hover{background:rgba(255,255,255,.2)}
.lyric-ctrl button.main{
  width:60px;height:60px;background:var(--accent);border-color:var(--accent);color:#fff;
}
.lyric-ctrl button.main svg{width:24px;height:24px}
.lyric-ctrl button.main:hover{filter:brightness(1.1)}

/* 竖屏手机：歌词居中单列，封面缩小，控制条贴近底部 */
@media (max-width:860px){
  .lyric-layer{align-items:flex-start;justify-content:center;padding:58px 18px 96px;overflow-y:auto}
  .lyric-layer .lyric-panel{flex-direction:column;width:100%;max-width:520px;gap:10px}
  .lyric-layer .lyric-head{align-items:flex-start;margin-bottom:6px}
  .lyric-layer .lyric-head .disc{width:76px;height:76px}
  .lyric-layer #lyricName{font-size:19px;margin:8px 0 2px}
  .lyric-layer #lyricSinger{font-size:12.5px}
  .lyric-layer .lyric-scroll{max-height:none;width:100%}
  .lyric-layer .lyric-scroll .lyric-line{font-size:16px;line-height:2.1;text-align:left}
  .lyric-layer .lyric-scroll .lyric-line.active{font-size:18px}
  .lyric-ctrl{bottom:auto;top:auto;margin-top:8px;position:sticky;bottom:8px;gap:22px}
  .lyric-ctrl button{width:42px;height:42px}
  .lyric-ctrl button.main{width:56px;height:56px}
  .lyric-tools{padding-bottom:6px}
  .lyric-layer .close-lyric{top:10px;right:10px;width:34px;height:34px;font-size:17px}
}
`
fs.writeFileSync('public/style.css', css, 'utf8')
console.log('CSS 控制条:', css.includes('.lyric-ctrl{'), '| 竖屏:', css.includes('歌词页播放控制'))
