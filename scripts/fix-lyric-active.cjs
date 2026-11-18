'use strict'
/* 歌词页：当前行放大 + 滚动跟随 */
const fs = require('node:fs')

/* ---------- 1) CSS：高亮行放大 ---------- */
const cp = 'mobile/www/style.css'
let c = fs.readFileSync(cp, 'utf8')

const MARK = '/* ==== 歌词高亮放大 ==== */'
if (!c.includes(MARK)) {
  c += `
${MARK}
/* 当前行：更大更亮，带过渡 */
.lyric-line {
  transition: color .25s ease, font-size .25s ease, transform .25s ease, opacity .25s ease;
  transform-origin: left center;
}
.lyric-line.active {
  color: #fff !important;
  font-size: 1.28em !important;
  font-weight: 700 !important;
  transform: scale(1.04);
  text-shadow: 0 2px 18px rgba(0,0,0,.6);
}
.lyric-line:not(.active) { opacity: .58; }
.lyric-line:hover { opacity: .95; }

@media (max-width: 860px) {
  .lyric-line { font-size: 17px; line-height: 2.05; }
  .lyric-line.active { font-size: 22px !important; }
}
`
  fs.writeFileSync(cp, c, 'utf8')
  console.log('高亮放大样式已加')
} else {
  console.log('样式已存在')
}

/* ---------- 2) app.js：确保滚动跟随 ---------- */
const ap = 'mobile/www/app.js'
let a = fs.readFileSync(ap, 'utf8')

/* 加 scrollLyricTo（如果不存在） */
if (!a.includes('function scrollLyricTo')) {
  const fn = `
/* 把指定歌词行滚动到容器垂直中央 */
function scrollLyricTo (index) {
  const box = document.getElementById('lyricScroll')
  const inner = document.getElementById('lyricInner')
  if (!box || !inner) return
  const lines = inner.querySelectorAll('.lyric-line')
  const el = lines[index]
  if (!el) return
  const target = el.offsetTop - box.clientHeight / 2 + el.offsetHeight / 2
  try {
    box.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
  } catch (e) {
    box.scrollTop = Math.max(0, target)
  }
}
`
  a = a.replace('function renderLyric () {', fn + '\nfunction renderLyric () {')
  console.log('scrollLyricTo 已加')
}

/* 检查高亮/滚动更新的地方，把 scrollLyricTo 接进去 */
const hi = a.indexOf('state.lyricIndex = idx')
if (hi > 0) {
  const seg = a.slice(Math.max(0, hi - 400), hi + 400)
  console.log('\n=== 高亮更新处 ===')
  console.log(seg)
} else {
  /* 找 classList.add('active') 的地方 */
  const ai = a.indexOf("classList.add('active')")
  if (ai > 0) {
    console.log('\n=== active 添加处 ===')
    console.log(a.slice(Math.max(0, ai - 500), ai + 300))
  }
}

fs.writeFileSync(ap, a, 'utf8')
console.log('\n完成')
