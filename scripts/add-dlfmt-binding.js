'use strict'
/* 补回下载格式按钮绑定（之前被误删） */
const fs = require('node:fs')
const p = 'public/app.js'
let s = fs.readFileSync(p, 'utf8')

if (s.includes(".dl-fmt')).forEach((b)")) {
  console.log('绑定已存在')
  process.exit(0)
}

const DD = String.fromCharCode(36, 36)   /* $$ */
const D = String.fromCharCode(36)        /* $ */
const Q = String.fromCharCode(39)        /* ' */

const block = [
  '  ' + DD + '(' + Q + '.dl-fmt' + Q + ').forEach((b) => {',
  '    b.classList.toggle(' + Q + 'active' + Q + ', b.dataset.fmt === state.dlFormat)',
  '    b.onclick = () => {',
  '      state.dlFormat = b.dataset.fmt',
  '      ' + DD + '(' + Q + '.dl-fmt' + Q + ').forEach((x) => x.classList.toggle(' + Q + 'active' + Q + ', x === b))',
  '      saveSettings()',
  '      toast(' + Q + '下载格式：' + Q + ' + (state.dlFormat === ' + Q + 'flac' + Q + ' ? ' + Q + 'FLAC 无损' + Q + ' : ' + Q + 'MP3 320K' + Q + '), 1600)',
  '    }',
  '  })',
  '',
].join('\n')

/* 插到设置面板渲染函数里：找 if ($('#dlCopyDir')) 或 if ($('#dlDirPick')) */
const anchors = ['  if (' + D + '(' + Q + '#dlCopyDir' + Q + ')) {', '  if (' + D + '(' + Q + '#dlDirPick' + Q + ')) {', "  if ($('#qqCookieSave')) {"]
let inserted = false
for (const a of anchors) {
  const i = s.indexOf(a)
  if (i > 0) {
    s = s.slice(0, i) + block + s.slice(i)
    inserted = true
    console.log('已插入到:', a.trim())
    break
  }
}

if (!inserted) {
  /* 兜底：插在 renderSettingsPane 函数开头 */
  const i = s.indexOf('function renderSettingsPane')
  if (i > 0) {
    const braceIdx = s.indexOf('{', i)
    s = s.slice(0, braceIdx + 1) + '\n' + block + s.slice(braceIdx + 1)
    inserted = true
    console.log('已插入到 renderSettingsPane 开头')
  }
}

if (inserted) fs.writeFileSync(p, s, 'utf8')
console.log('绑定已加:', s.includes(".dl-fmt')).forEach((b)"))
