'use strict'
/* 点下载时弹窗选择格式（而不是在设置里预设） */
const fs = require('node:fs')
const p = 'public/app.js'
let s = fs.readFileSync(p, 'utf8')

/* 1) 加一个格式选择弹窗函数 */
if (!s.includes('function askDownloadFormat')) {
  const fn = `
/* 下载前询问格式：返回 'mp3' | 'flac' | null */
function askDownloadFormat (song) {
  return new Promise((resolve) => {
    const old = document.getElementById('__fmtDlg')
    if (old) old.remove()

    const wrap = document.createElement('div')
    wrap.id = '__fmtDlg'
    wrap.style.cssText = 'position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,.42);display:flex;align-items:center;justify-content:center'
    wrap.innerHTML = ''
      + '<div style="background:var(--panel-a,#fff);border-radius:10px;padding:22px 24px;min-width:340px;box-shadow:0 18px 48px rgba(0,0,0,.28)">'
      + '  <div style="font-size:16px;font-weight:600;color:var(--text,#222);margin-bottom:6px">选择下载格式</div>'
      + '  <div style="font-size:12.5px;color:var(--text-3,#888);margin-bottom:18px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (song ? (song.name + ' - ' + song.singer) : '') + '</div>'
      + '  <div style="display:flex;gap:10px;margin-bottom:16px">'
      + '    <button data-f="mp3" style="flex:1;padding:14px 10px;border:1px solid var(--border-strong,#ccc);border-radius:8px;background:var(--bg-input,#f7f7f7);color:var(--text,#222);cursor:pointer;font-size:13.5px">MP3 320K<br><span style="font-size:11px;color:var(--text-3,#999)">兼容性最好</span></button>'
      + '    <button data-f="flac" style="flex:1;padding:14px 10px;border:1px solid var(--border-strong,#ccc);border-radius:8px;background:var(--bg-input,#f7f7f7);color:var(--text,#222);cursor:pointer;font-size:13.5px">FLAC 无损<br><span style="font-size:11px;color:var(--text-3,#999)">体积较大</span></button>'
      + '  </div>'
      + '  <div style="text-align:right"><button data-f="cancel" style="padding:7px 16px;border:1px solid var(--border,#ddd);border-radius:6px;background:transparent;color:var(--text-3,#888);cursor:pointer;font-size:12.5px">取消</button></div>'
      + '</div>'

    const close = (v) => { wrap.remove(); resolve(v) }
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap) return close(null)
      const btn = e.target.closest('button[data-f]')
      if (!btn) return
      const f = btn.dataset.f
      close(f === 'cancel' ? null : f)
    })
    document.body.appendChild(wrap)
  })
}
`
  s = s.replace('async function downloadSong (song) {', fn + '\nasync function downloadSong (song) {')
  console.log('弹窗函数已加')
}

/* 2) downloadSong 开头：先问格式 */
const head = `async function downloadSong (song) {
  const key = song.source + song.id
  if (state.downloading.has(key)) return toast('正在下载中…', 1200)`

const headNew = `async function downloadSong (song) {
  const key = song.source + song.id
  if (state.downloading.has(key)) return toast('正在下载中…', 1200)

  /* 先让用户选格式 */
  const pickedFmt = await askDownloadFormat(song)
  if (!pickedFmt) return
  state.dlFormat = pickedFmt
  saveSettings()`

if (s.includes(head)) {
  s = s.replace(head, headNew)
  console.log('downloadSong 已加格式询问')
} else {
  console.log('downloadSong 头部未匹配')
}

fs.writeFileSync(p, s, 'utf8')
console.log('askDownloadFormat:', s.includes('function askDownloadFormat'))
