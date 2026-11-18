'use strict'
/* 检查安装包里是否含最新修复 */
const fs = require('node:fs')
const { execSync } = require('node:child_process')

const zip = 'D:/Phonograph/build/_check.zip'
if (!fs.existsSync(zip)) {
  console.log('zip 不存在: ' + zip)
  process.exit(1)
}
console.log('zip: ' + (fs.statSync(zip).size / 1048576).toFixed(1) + ' MB')

function extract (inner) {
  try {
    return execSync('tar.exe -xOf "' + zip + '" "' + inner + '"', { encoding: 'utf8', maxBuffer: 80 * 1024 * 1024 })
  } catch (e) {
    return ''
  }
}

/* app.js */
const app = extract('./public/app.js')
console.log('\n=== public/app.js ===')
console.log('  长度                ' + app.length)
console.log('  checkPreviewAndSwitch ' + app.includes('checkPreviewAndSwitch'))
console.log('  三重保险            ' + app.includes('三重保险'))
console.log('  askDownloadFormat   ' + app.includes('askDownloadFormat'))
console.log('  scrollPanelLyric    ' + app.includes('scrollPanelLyric'))

/* source-manager.js */
const sm = extract('./app/lib/source-manager.js')
console.log('\n=== app/lib/source-manager.js ===')
console.log('  长度        ' + sm.length)
console.log('  外链过滤    ' + sm.includes('song/media/outer'))

/* server.js */
const srv = extract('./app/server.js')
console.log('\n=== app/server.js ===')
console.log('  长度          ' + srv.length)
console.log('  download-dir  ' + srv.includes('/api/download-dir'))
console.log('  downloads     ' + srv.includes('/api/downloads'))
console.log('  unblockFile   ' + srv.includes('unblockFile'))

/* style.css */
const css = extract('./public/style.css')
console.log('\n=== public/style.css ===')
console.log('  长度              ' + css.length)
console.log('  歌词高亮放大      ' + css.includes('歌词高亮放大'))
console.log('  手机端顶栏两行    ' + css.includes('手机端顶栏两行布局'))

/* 结论 */
console.log('\n=== 结论 ===')
const hasPreviewFix = app.includes('checkPreviewAndSwitch')
const hasOuterFix = sm.includes('song/media/outer')
if (hasPreviewFix && hasOuterFix) {
  console.log('  安装包含全部修复 ✅  重装即可')
} else {
  console.log('  安装包缺少修复：')
  if (!hasPreviewFix) console.log('    - 前端缺 checkPreviewAndSwitch（残缺检测）')
  if (!hasOuterFix) console.log('    - 服务端缺外链过滤')
  console.log('  → 需要重新打包')
}
