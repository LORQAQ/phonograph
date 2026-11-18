'use strict'
/* 歌词页三处修复：
   1) 点击歌词跳转（去掉 duration 限制）
   2) 专辑封面背景（原来 lyricBg 是空的 → 全透明）
   3) 移动端歌词样式补全 */
const fs = require('node:fs')

/* ---------- 1) app.js：点击跳转 + 背景图 ---------- */
const ap = 'mobile/www/app.js'
let a = fs.readFileSync(ap, 'utf8')

/* 点击跳转：兼容 duration 未就绪 */
a = a.replace(
  `  box.querySelectorAll('.lyric-line').forEach((el) => {
    el.onclick = () => {
      const t = state.lyrics[Number(el.dataset.i)].t - state.lrcOffset
      if (audio.duration) audio.currentTime = Math.max(0, t)
    }
  })`,
  `  box.querySelectorAll('.lyric-line').forEach((el) => {
    el.style.cursor = 'pointer'
    el.onclick = () => {
      const line = state.lyrics[Number(el.dataset.i)]
      if (!line) return
      const t = Math.max(0, line.t - state.lrcOffset)
      try {
        /* 不等 duration，直接设；浏览器会自动夹到有效范围 */
        audio.currentTime = t
        if (audio.paused) audio.play().catch(() => {})
        toast('跳到 ' + Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0'), 1400)
      } catch (e) {
        toast('跳转失败：' + e.message, 2000)
      }
    }
  })
  /* 同步滚动位置到当前行 */
  if (state.lyricIndex >= 0) scrollLyricTo(state.lyricIndex)`
)

/* 歌词页打开时设置背景图 + 封面 */
if (!a.includes('function paintLyricBg')) {
  const fn = `
/* 歌词页背景：专辑封面 + 高斯感暗化 */
function paintLyricBg (song) {
  const bg = document.getElementById('lyricBg')
  const cover = document.getElementById('lyricCover')
  const url = song && (song.cover || coverUrl(song))
  if (cover && url) cover.src = url
  if (!bg) return
  if (url) {
    bg.style.backgroundImage = 'url("' + url + '")'
    bg.style.opacity = '1'
  } else {
    bg.style.backgroundImage = 'none'
  }
}
`
  a = a.replace('function renderLyric () {', fn + '\nfunction renderLyric () {')
}

/* 打开歌词层时调用 paintLyricBg */
if (!a.includes('paintLyricBg(current)')) {
  /* 找 showLyricLayer / openLyric 类似函数 */
  const cands = ['function openLyric', 'function showLyric', 'function toggleLyric', 'lyricLayer.classList.add(\'show\')']
  for (const c of cands) {
    const i = a.indexOf(c)
    if (i > 0) {
      const brace = a.indexOf('{', i)
      if (brace > 0) {
        a = a.slice(0, brace + 1) + '\n  try { paintLyricBg(current) } catch (e) { }' + a.slice(brace + 1)
        console.log('已在 ' + c + ' 里调用 paintLyricBg')
        break
      }
    }
  }
}

fs.writeFileSync(ap, a, 'utf8')
console.log('app.js 已更新')

/* ---------- 2) style.css：歌词页背景不透明 ---------- */
const cp = 'mobile/www/style.css'
let css = fs.readFileSync(cp, 'utf8')

const MARK = '/* ==== 歌词页显示修复 ==== */'
if (!css.includes(MARK)) {
  css += `
${MARK}
/* 背景层：专辑图铺满 + 暗化，保证文字可读 */
.lyric-layer { background: #0d0b09 !important; }
.lyric-bg {
  position: absolute; inset: -40px;
  background-size: cover; background-position: center;
  filter: blur(40px) brightness(.42) saturate(1.1);
  transform: scale(1.15);
  opacity: 0;
  transition: opacity .5s;
  z-index: 0;
}
.lyric-layer::before {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(6,5,4,.55), rgba(6,5,4,.86));
  z-index: 1; pointer-events: none;
}
.lyric-panel { position: relative; z-index: 2; }

/* 歌词行：白字，可点 */
.lyric-line {
  color: rgba(255,255,255,.68) !important;
  cursor: pointer;
  transition: color .18s, transform .18s;
}
.lyric-line:hover { color: rgba(255,255,255,.92) !important; }
.lyric-line:active { transform: scale(.985); }
.lyric-line.active { color: var(--accent, #3ba55d) !important; font-weight: 600; }
.lyric-empty { color: rgba(255,255,255,.5) !important; }

/* 歌词头部文字 */
.lyric-head h2, #lyricName { color: #fff !important; }
.lyric-head p, #lyricSinger { color: rgba(255,255,255,.62) !important; }

/* 移动端歌词排版 */
@media (max-width: 860px) {
  .lyric-layer .lyric-panel { padding: 56px 22px 150px; gap: 18px; }
  .lyric-layer .disc { width: 96px; height: 96px; }
  .lyric-layer #lyricName { font-size: 19px; }
  .lyric-layer .lyric-line { font-size: 16px; line-height: 2.1; }
  .lyric-layer .lyric-line.active { font-size: 17.5px; }
  .lyric-layer .lyric-ctrl { bottom: 84px; }
}
`
  fs.writeFileSync(cp, css, 'utf8')
  console.log('style.css 歌词样式已加')
} else {
  console.log('歌词样式已存在')
}
