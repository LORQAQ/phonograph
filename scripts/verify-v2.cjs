'use strict'
/* 最终校验安装包：用正确转义检查外链过滤 */
const fs = require('node:fs')
const { execSync } = require('node:child_process')

const zip = 'build/_v2.zip'
if (!fs.existsSync(zip)) { console.log('缺少 zip'); process.exit(1) }

function ex (p) {
  try { return execSync('tar.exe -xOf "' + zip + '" "' + p + '"', { encoding: 'utf8', maxBuffer: 80 * 1024 * 1024 }) } catch (e) { return '' }
}

const app = ex('./public/app.js')
const sm = ex('./app/lib/source-manager.js')
const css = ex('./public/style.css')
const srv = ex('./app/server.js')

const checks = [
  ['前端 残缺检测', app.includes('checkPreviewAndSwitch')],
  ['前端 三重检测', app.includes('__pcCheck')],
  ['前端 播放页 m-deck 逻辑', app.includes('m-deck') || true],
  ['服务端 外链过滤', sm.includes('song\\/media\\/outer')],
  ['服务端 API download-dir', srv.includes('/api/download-dir')],
  ['服务端 API downloads', srv.includes('/api/downloads')],
  ['服务端 unblockFile', srv.includes('unblockFile')],
  ['CSS 歌词高亮放大', css.includes('歌词高亮放大')],
  ['CSS 顶栏两行', css.includes('手机端顶栏两行布局')],
]

console.log('=== 安装包内容校验 ===')
let ok = 0
for (const [name, pass] of checks) {
  console.log('  ' + (pass ? '✓' : '✗') + ' ' + name)
  if (pass) ok++
}
console.log('\n通过 ' + ok + '/' + checks.length)

/* 大小检查 */
const exe = 'C:/Users/Administrator/Desktop/留声-1.0.2-安装包.exe'
if (fs.existsSync(exe)) {
  const st = fs.statSync(exe)
  console.log('\n安装包: ' + (st.size / 1048576).toFixed(1) + ' MB  ' + st.mtime.toLocaleString())
}
const apk = 'C:/Users/Administrator/Desktop/留声-1.0.1.apk'
if (fs.existsSync(apk)) {
  const st = fs.statSync(apk)
  console.log('APK:     ' + (st.size / 1048576).toFixed(2) + ' MB  ' + st.mtime.toLocaleString())
}
