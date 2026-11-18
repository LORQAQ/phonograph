'use strict'
/* 下载回退为浏览器下载（最稳），设置页保留目录与打开按钮 */
const fs = require('node:fs')
let app = fs.readFileSync('public/app.js', 'utf8')

const startMark = "  state.downloading.add(key)\n  toast('开始下载：' + song.name + '（' + (state.dlFormat === 'flac' ? 'FLAC' : 'MP3') + '）')"
const i = app.indexOf(startMark)
if (i < 0) { console.log('未找到下载块'); process.exit(0) }
const endMark = "\n}"
const j = app.indexOf(endMark, i)
if (j < 0) { console.log('未找到结束'); process.exit(0) }

const block = `  state.downloading.add(key)
  toast('开始下载：' + song.name + '（' + (state.dlFormat === 'flac' ? 'FLAC' : 'MP3') + '）', 2200)
  try {
    const p = songParams(song)
    const a = document.createElement('a')
    a.href = '/api/download?' + p.toString()
    a.download = ''
    document.body.appendChild(a)
    a.click()
    setTimeout(() => a.remove(), 1500)
    state.downloads.unshift({ name: song.name, singer: song.singer, quality: state.quality, ts: Date.now() })
    state.downloads = state.downloads.slice(0, 30)
    LS.set('lx.downloads', state.downloads)
  } catch (e) {
    toast('下载失败：' + e.message, 3000)
  } finally {
    setTimeout(() => {
      state.downloading.delete(key)
      try { renderList && renderList() } catch (e) {}
    }, 3000)
  }`

app = app.slice(0, i) + block + app.slice(j)
fs.writeFileSync('public/app.js', app, 'utf8')
console.log('已回退为浏览器下载')
