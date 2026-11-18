'use strict'
/* 下载完成后解除 Windows 的「来自网络」标记（避免 SmartScreen 提示有害） */
const fs = require('node:fs')
const p = 'app/server.js'
let s = fs.readFileSync(p, 'utf8')

/* 在 transcode.js 里加一个 unblock 工具 */
const tp = 'app/lib/transcode.js'
let t = fs.readFileSync(tp, 'utf8')
if (!t.includes('function unblockFile')) {
  t = t.replace(
    'module.exports = {',
    `/** 解除 Windows「来自网络」标记（Zone.Identifier 数据流） */
function unblockFile (filePath) {
  if (process.platform !== 'win32') return
  /* 1) 直接删数据流（最快，不需要外部程序） */
  try { fs.unlinkSync(filePath + ':Zone.Identifier') } catch (e) { }
  /* 2) 兜底：调 PowerShell Unblock-File（失败也无所谓） */
  try {
    const { execFile } = require('node:child_process')
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', 'Unblock-File -LiteralPath "' + filePath.replace(/"/g, '`"') + '"'], { windowsHide: true }, () => { })
  } catch (e) { }
}

module.exports = { unblockFile,`
  )
  fs.writeFileSync(tp, t, 'utf8')
  console.log('unblockFile 已加')
}

/* save=1 写盘后调用 */
const targets = [
  "            return json(res, 200, { ok: true, path: outPath, size: st2.size, name: outName, converted: rawFmt + '→' + wantFmt })",
  "            return json(res, 200, { ok: true, path: fallbackPath, size: buf.length, name: fallbackName, converted: 'none' })",
  "        return json(res, 200, { ok: true, path: outPath, size: buf.length, name: outName })",
]
let n = 0
for (const line of targets) {
  if (s.includes(line)) {
    const indent = line.match(/^(\s*)/)[1]
    const pathVar = line.includes('fallbackPath') ? 'fallbackPath' : 'outPath'
    s = s.replace(line, indent + 'try { transcoder.unblockFile(' + pathVar + ') } catch (e) { }\n' + line)
    n++
  }
}
fs.writeFileSync(p, s, 'utf8')
console.log('unblock 调用已插入:', n, '处')
