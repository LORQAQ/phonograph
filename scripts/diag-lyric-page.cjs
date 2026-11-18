'use strict'
/* 诊断歌词页：背景、透明度、点击跳转 */
const fs = require('node:fs')

const html = fs.readFileSync('mobile/www/index.html', 'utf8')
const css = fs.readFileSync('mobile/www/style.css', 'utf8')
const js = fs.readFileSync('mobile/www/app.js', 'utf8')

console.log('=== 歌词层 HTML ===')
const i = html.indexOf('lyric-layer')
if (i > 0) console.log(html.slice(Math.max(0, i - 150), i + 900))

console.log('\n=== 移动端歌词 CSS ===')
const m = css.indexOf('@media (max-width: 860px)')
let found = false
while (m >= 0 && !found) {
  const seg = css.slice(m, m + 3000)
  if (seg.includes('lyric-layer')) {
    seg.split('\n').forEach((l) => {
      if (/lyric|disc|bg|background|opacity/.test(l)) console.log('  ' + l.trim().slice(0, 130))
    })
    found = true
  }
  break
}

console.log('\n=== 歌词行点击绑定 ===')
js.split('\n').forEach((l, idx) => {
  if (/lyric-line|lyricLine|seekTo|currentTime\s*=/.test(l)) {
    console.log('  L' + (idx + 1) + ': ' + l.trim().slice(0, 120))
  }
})

console.log('\n=== 歌词渲染函数 ===')
const r = js.indexOf('function renderLyric')
if (r > 0) console.log(js.slice(r, r + 1400))
