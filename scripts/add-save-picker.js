'use strict'
/* 下载：优先用 File System Access API（弹目录选择、直接写盘），不支持才回落浏览器下载 */
const fs = require('node:fs')
const p = 'public/app.js'
let s = fs.readFileSync(p, 'utf8')

if (!s.includes('showSaveFilePicker')) {
  const anchor = "  state.downloading.add(key)\n  toast('开始下载：' + song.name + '（' + (state.dlFormat === 'flac' ? 'FLAC' : 'MP3') + '）', 2200)"
  const block = `  state.downloading.add(key)
  toast('开始下载：' + song.name + '（' + (state.dlFormat === 'flac' ? 'FLAC' : 'MP3') + '）', 2200)

  /* 优先：系统「另存为」对话框，直接写到你选的目录 */
  if (window.showSaveFilePicker) {
    try {
      const ext = state.dlFormat === 'flac' ? '.flac' : '.mp3'
      const safeName = ((song.singer || '') + ' - ' + (song.name || '')).replace(/[\\\\/:*?"<>|]/g, '_').slice(0, 80) + ext
      const handle = await window.showSaveFilePicker({
        suggestedName: safeName,
        types: [{ description: '音频', accept: { 'audio/mpeg': ['.mp3'], 'audio/flac': ['.flac'] } }],
      })
      toast('正在下载…', 3000)
      const resp = await fetch('/api/download?' + songParams(song).toString())
      if (!resp.ok) throw new Error('服务器返回 ' + resp.status)
      const blob = await resp.blob()
      const w = await handle.createWritable()
      await w.write(blob)
      await w.close()
      toast('已保存：' + handle.name + '（' + (blob.size / 1048576).toFixed(1) + ' MB）', 3600)
      state.downloads.unshift({ name: song.name, singer: song.singer, quality: state.quality, ts: Date.now(), path: handle.name })
      state.downloads = state.downloads.slice(0, 30)
      LS.set('lx.downloads', state.downloads)
      state.downloading.delete(key)
      try { renderList && renderList() } catch (e) { }
      return
    } catch (e) {
      if (e && e.name === 'AbortError') {
        state.downloading.delete(key)
        toast('已取消下载', 1800)
        return
      }
      /* 其他错误继续走浏览器下载 */
    }
  }`

  if (s.includes(anchor)) {
    s = s.replace(anchor, block)
    fs.writeFileSync(p, s, 'utf8')
    console.log('已接入 File System Access API')
  } else {
    console.log('未找到插入点')
  }
} else {
  console.log('已存在')
}
