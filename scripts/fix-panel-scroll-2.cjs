'use strict'
/* scrollPanelLyric 位置算错了（用 offsetTop 不靠谱），改用 getBoundingClientRect */
const fs = require('node:fs')
const p = 'mobile/www/app.js'
let a = fs.readFileSync(p, 'utf8')

const startMark = 'function scrollPanelLyric () {'
const start = a.indexOf(startMark)
if (start < 0) { console.log('未找到'); process.exit(1) }

let depth = 0
let started = false
let end = start
for (let i = start; i < a.length; i++) {
  if (a[i] === '{') { depth++; started = true } else if (a[i] === '}') { depth--; if (started && depth === 0) { end = i + 1; break } }
}

const impl = `function scrollPanelLyric () {
  const roll = $('#lyricRoll')
  if (!roll) return
  const el = roll.querySelector('.ll.active')
  if (!el) return

  /* 移动端真正滚动的是 .deck-body；桌面端是 .lyric-roll 自己 */
  const scroller = document.querySelector('.m-deck .deck-body') || roll
  const scRect = scroller.getBoundingClientRect()
  const elRect = el.getBoundingClientRect()
  /* 元素相对滚动容器可视区顶部的偏移 */
  const delta = elRect.top - scRect.top
  const target = Math.max(0, scroller.scrollTop + delta - scroller.clientHeight / 2 + elRect.height / 2)
  try {
    scroller.scrollTo({ top: target, behavior: 'smooth' })
  } catch (e) {
    scroller.scrollTop = target
  }
}`

a = a.slice(0, start) + impl + a.slice(end)
fs.writeFileSync(p, a, 'utf8')
console.log('scrollPanelLyric 已改用 getBoundingClientRect')
