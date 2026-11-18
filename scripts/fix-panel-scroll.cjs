'use strict'
/* 播放页歌词滚动：原来滚的是 #lyricRoll，但真正有滚动条的是 .deck-body */
const fs = require('node:fs')
const p = 'mobile/www/app.js'
let a = fs.readFileSync(p, 'utf8')

const startMark = 'function scrollPanelLyric () {'
const start = a.indexOf(startMark)
if (start < 0) { console.log('未找到 scrollPanelLyric'); process.exit(1) }

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

  /* 真正有滚动条的是 .deck-body（移动端），桌面端是 .lyric-roll 自己 */
  const scroller = document.querySelector('.m-deck .deck-body') || roll
  const isDeckBody = scroller !== roll

  let target
  if (isDeckBody) {
    /* deck-body 里：用行相对容器顶部的位置 */
    const rollTop = roll.offsetTop
    target = rollTop + el.offsetTop - scroller.clientHeight / 2 + el.offsetHeight / 2
  } else {
    target = el.offsetTop - scroller.clientHeight / 2 + el.offsetHeight / 2
  }
  target = Math.max(0, target)
  try {
    scroller.scrollTo({ top: target, behavior: 'smooth' })
  } catch (e) {
    scroller.scrollTop = target
  }
}`

a = a.slice(0, start) + impl + a.slice(end)
fs.writeFileSync(p, a, 'utf8')
console.log('scrollPanelLyric 已改为滚动 deck-body')
