'use strict'
/* 进度条只绑了 mouse 事件，手机上拖不动
   改用 Pointer Events（同时支持鼠标和触摸） */
const fs = require('node:fs')

const OLD = `function bindProgress () {
  const bar = $('#progress')
  let dragging = false
  const posOf = (e) => {
    const r = bar.getBoundingClientRect()
    return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
  }
  bar.addEventListener('mousedown', (e) => {
    if (!audio.duration) return
    dragging = true
    bar.classList.add('dragging')
    paintProgress(posOf(e))
    audio.currentTime = posOf(e) * audio.duration
  })
  window.addEventListener('mousemove', (e) => {
    if (!audio.duration) return
    const p = posOf(e)
    if (bar.contains(e.target) || dragging) {
      $('#progressFloat').style.left = (p * 100) + '%'
      $('#progressFloat').textContent = fmtTime(p * audio.duration)
    }
    if (dragging) { paintProgress(p); audio.currentTime = p * audio.duration }
  })
  window.addEventListener('mouseup', () => { dragging = false; bar.classList.remove('dragging') })
}`

const NEW = `function bindProgress () {
  const bar = $('#progress')
  if (!bar) return
  let dragging = false
  /* 兼容鼠标、触摸、笔：统一取 clientX */
  const cx = (e) => {
    if (e.touches && e.touches.length) return e.touches[0].clientX
    if (e.changedTouches && e.changedTouches.length) return e.changedTouches[0].clientX
    return e.clientX
  }
  const posOf = (e) => {
    const r = bar.getBoundingClientRect()
    if (!r.width) return 0
    return Math.min(1, Math.max(0, (cx(e) - r.left) / r.width))
  }
  const start = (e) => {
    if (!audio.duration) return
    dragging = true
    bar.classList.add('dragging')
    const p = posOf(e)
    paintProgress(p)
    audio.currentTime = p * audio.duration
    if (e.cancelable) e.preventDefault()
  }
  const move = (e) => {
    if (!audio.duration) return
    const p = posOf(e)
    const fl = $('#progressFloat')
    if (fl) {
      fl.style.left = (p * 100) + '%'
      fl.textContent = fmtTime(p * audio.duration)
    }
    if (dragging) {
      paintProgress(p)
      audio.currentTime = p * audio.duration
      if (e.cancelable) e.preventDefault()
    }
  }
  const end = () => {
    if (!dragging) return
    dragging = false
    bar.classList.remove('dragging')
  }

  /* Pointer Events（优先，一套覆盖鼠标+触摸） */
  if (window.PointerEvent) {
    bar.addEventListener('pointerdown', (e) => {
      try { bar.setPointerCapture(e.pointerId) } catch (er) { }
      start(e)
    })
    bar.addEventListener('pointermove', move)
    bar.addEventListener('pointerup', end)
    bar.addEventListener('pointercancel', end)
  } else {
    /* 老环境退回 mouse + touch */
    bar.addEventListener('mousedown', start)
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', end)
    bar.addEventListener('touchstart', start, { passive: false })
    bar.addEventListener('touchmove', move, { passive: false })
    bar.addEventListener('touchend', end)
    bar.addEventListener('touchcancel', end)
  }
}`

let count = 0
for (const p of ['mobile/www/app.js', 'public/app.js']) {
  let s = fs.readFileSync(p, 'utf8')
  if (s.includes('PointerEvent') && s.includes('pointerdown')) {
    console.log(p + ': 已有 Pointer 支持')
    continue
  }
  if (s.includes(OLD)) {
    s = s.replace(OLD, NEW)
    fs.writeFileSync(p, s, 'utf8')
    count++
    console.log(p + ': 已改为 Pointer Events')
  } else {
    console.log(p + ': 未匹配（可能格式不同）')
  }
}
console.log('\n共修改 ' + count + ' 个文件')
