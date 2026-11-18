'use strict'
/* 电脑端下载改为后端直存到下载目录 */
const fs = require('node:fs')
let app = fs.readFileSync('public/app.js', 'utf8')

const oldBlock = `  state.downloading.add(key)
  toast('开始下载：' + song.name)
  const a = document.createElement('a')
  a.href = '/api/download?' + songParams(song).toString()
  a.download = ''
  document.body.appendChild(a)
  a.click()
  setTimeout(() => { a.remove(); state.downloading.delete(key) }, 4000)
  state.downloads.unshift({ name: song.name, singer: song.singer, quality: state.quality, ts: Date.now() })
  state.downloads = state.downloads.slice(0, 30)
  LS.set('lx.downloads', state.downloads)
}`

const newBlock = `  state.downloading.add(key)
  toast('开始下载：' + song.name + '（' + (state.dlFormat === 'flac' ? 'FLAC' : 'MP3') + '）')
  try {
    const p = songParams(song)
    p.set('save', '1')
    const r = await api('/api/download?' + p.toString())
    if (!r || !r.ok) throw new Error((r && r.error) || '保存失败')
    const mb = (r.size / 1048576).toFixed(1)
    toast('已保存 ' + mb + ' MB → ' + r.name, 3600)
    state.downloads.unshift({ name: song.name, singer: song.singer, quality: state.quality, ts: Date.now(), path: r.path })
    state.downloads = state.downloads.slice(0, 30)
    LS.set('lx.downloads', state.downloads)
  } catch (e) {
    toast('下载失败：' + e.message, 3600)
  } finally {
    state.downloading.delete(key)
    renderList && renderList()
  }
}`

if (app.includes(oldBlock)) {
  app = app.replace(oldBlock, newBlock)
  fs.writeFileSync('public/app.js', app, 'utf8')
  console.log('电脑端下载已改为直存')
} else {
  console.log('未匹配到旧下载块')
}
