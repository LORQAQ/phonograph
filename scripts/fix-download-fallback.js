'use strict'
/* 下载彻底不弹窗：
   1) 后端 save=1 时，配置目录不可写就自动回落到默认目录
   2) 前端移除 showSaveFilePicker（它正是弹窗的来源）
*/
const fs = require('node:fs')

/* ---------- 1) 后端：目录不可写自动回落 ---------- */
let s = fs.readFileSync('app/server.js', 'utf8')

const oldLine = `      const wantFmt = q.get('format') === 'flac' ? 'flac' : 'mp3'
      const dir = db.settings.downloadDir || defaultDownloadDir()
      try { fs.mkdirSync(dir, { recursive: true }) } catch (e) { }`

const newLine = `      const wantFmt = q.get('format') === 'flac' ? 'flac' : 'mp3'
      /* 选目录可写就用，不可写自动回落到默认目录（避免下载失败） */
      let dir = db.settings.downloadDir || defaultDownloadDir()
      let dirFallback = false
      try {
        fs.mkdirSync(dir, { recursive: true })
        fs.accessSync(dir, fs.constants.W_OK)
        const probe = path.join(dir, '.w_test')
        fs.writeFileSync(probe, 'ok')
        fs.unlinkSync(probe)
      } catch (e) {
        dir = defaultDownloadDir()
        dirFallback = true
        try { fs.mkdirSync(dir, { recursive: true }) } catch (e2) { }
      }`

if (s.includes(oldLine)) {
  s = s.replace(oldLine, newLine)
  /* 返回里带上回落标记 */
  s = s.replace(
    "return json(res, 200, { ok: true, path: outPath, size: buf.length, name: outName })",
    "return json(res, 200, { ok: true, path: outPath, size: buf.length, name: outName, dirFallback })"
  )
  fs.writeFileSync('app/server.js', s, 'utf8')
  console.log('后端：目录不可写自动回落 已加')
} else {
  console.log('后端：未匹配')
}

/* ---------- 2) 前端：去掉 showSaveFilePicker 分支 ---------- */
const fp = 'public/app.js'
let a = fs.readFileSync(fp, 'utf8')
const startMark = "  /* 优先：系统「另存为」对话框，直接写到你选的目录 */"
const endMark = "  state.downloading.add(key)\n  toast('开始下载：' + song.name + '（' + (state.dlFormat === 'flac' ? 'FLAC' : 'MP3') + '）', 2200)\n  try {"
const s1 = a.indexOf(startMark)
if (s1 > 0) {
  /* 找到该 if 块的结束：从 startMark 起，括号平衡到 0 */
  let depth = 0
  let end = s1
  let started = false
  for (let i = s1; i < a.length; i++) {
    if (a[i] === '{') { depth++; started = true } else if (a[i] === '}') { depth--; if (started && depth === 0) { end = i + 1; break } }
  }
  a = a.slice(0, s1) + a.slice(end)
  fs.writeFileSync(fp, a, 'utf8')
  console.log('前端：另存为分支已移除')
} else {
  console.log('前端：未找到另存为分支')
}
console.log('残留 showSaveFilePicker:', (a.match(/showSaveFilePicker/g) || []).length)
