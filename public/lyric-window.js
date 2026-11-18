'use strict'
/* 桌面歌词窗口：接收主窗口 BroadcastChannel 状态
 * 在 WebView2 原生壳里时，背景透明、可拖动、可关闭；浏览器里退化为普通页面 */
const $ = (s) => document.querySelector(s)
const lineEl = $('#line')
const nextEl = $('#next')
const songEl = $('#song')
const tagEl = $('#tag')
const fillEl = $('#fill')
const native = !!(window.chrome && window.chrome.webview)

let bc = null
try { bc = new BroadcastChannel('lx-music') } catch (e) { bc = null }

const state = { lyrics: [], index: -1, playing: false, time: 0, duration: 0, song: null }

function setLine (text, animate) {
  if (lineEl.textContent === text) return
  if (animate) {
    lineEl.classList.add('swap')
    setTimeout(() => {
      lineEl.textContent = text || '♪'
      lineEl.classList.remove('swap')
    }, 130)
  } else {
    lineEl.textContent = text || '♪'
  }
}

function apply (d) {
  if (!d || d.type !== 'state') return
  const songChanged = state.song && d.song && d.song.name !== state.song.name
  state.song = d.song
  state.playing = !!d.playing
  state.time = d.time || 0
  state.duration = d.duration || 0
  document.body.classList.toggle('playing', state.playing)
  document.body.classList.toggle('paused', !state.playing)

  songEl.textContent = d.song ? (d.song.name + ' — ' + (d.song.singer || '')) : 'LX Phonograph'
  tagEl.textContent = d.quality ? String(d.quality).toUpperCase() : '—'

  if (Array.isArray(d.lyric) && d.lyric.length) {
    state.lyrics = d.lyric
    state.index = typeof d.index === 'number' ? d.index : -1
    if (state.index >= 0 && d.lyric[state.index]) {
      setLine(d.lyric[state.index], true)
      nextEl.textContent = d.lyric[state.index + 1] || ''
    } else {
      setLine(d.song ? d.song.name : '—', songChanged)
      nextEl.textContent = d.lyric[0] || ''
    }
  } else {
    state.lyrics = []
    setLine(d.song ? d.song.name : '—', songChanged)
    nextEl.textContent = d.song ? (d.song.singer || '') : ''
  }
  fillEl.style.width = state.duration ? Math.min(100, (state.time / state.duration) * 100) + '%' : '0%'
}

if (bc) {
  bc.onmessage = (ev) => apply(ev.data)
  setTimeout(() => { try { bc.postMessage({ type: 'hello' }) } catch (e) {} }, 240)
}

/* 本地平滑推进进度（主窗口约 800ms 广播一次） */
let lastTick = 0
function tick (now) {
  const dt = lastTick ? (now - lastTick) / 1000 : 0
  lastTick = now
  if (state.playing && state.duration) {
    state.time = Math.min(state.duration, state.time + dt)
    fillEl.style.width = Math.min(100, (state.time / state.duration) * 100) + '%'
  }
  requestAnimationFrame(tick)
}
requestAnimationFrame(tick)

/* 拖动窗口（顶部信息条） */
const dragBar = $('#dragBar')
if (dragBar) {
  dragBar.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return
    if (e.target.closest('#closeBtn')) return
    if (native) window.chrome.webview.postMessage('drag')
  })
}

/* 关闭 */
const closeBtn = $('#closeBtn')
if (closeBtn) {
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    if (native) window.chrome.webview.postMessage('close-lyric')
    else window.close()
  })
}

/* 单击暂停 / 双击下一首（避开顶部条） */
let clickTimer = null
document.addEventListener('click', (e) => {
  if (e.target.closest('#dragBar')) return
  clearTimeout(clickTimer)
  clickTimer = setTimeout(() => { if (bc) bc.postMessage({ type: 'control', action: 'toggle' }) }, 210)
})
document.addEventListener('dblclick', (e) => {
  if (e.target.closest('#dragBar')) return
  clearTimeout(clickTimer)
  if (bc) bc.postMessage({ type: 'control', action: 'next' })
})
document.addEventListener('keydown', (e) => {
  if (!bc) return
  if (e.code === 'Space') { e.preventDefault(); bc.postMessage({ type: 'control', action: 'toggle' }) }
  if (e.key === 'ArrowRight') bc.postMessage({ type: 'control', action: 'next' })
  if (e.key === 'ArrowLeft') bc.postMessage({ type: 'control', action: 'prev' })
})
