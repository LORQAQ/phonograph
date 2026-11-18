'use strict'
/* 最终校验：用实际字符串检查 */
const fs = require('node:fs')
const { execSync } = require('node:child_process')

function ex (p) {
  try { return execSync('tar.exe -xOf build/_v3.zip ' + p, { encoding: 'utf8', maxBuffer: 80000000 }) } catch (e) { return '' }
}

const app = ex('./public/app.js')
const html = ex('./public/index.html')
const sm = ex('./app/lib/source-manager.js')
const css = ex('./public/style.css')
const srv = ex('./app/server.js')

const checks = [
  ['app.js 残缺检测', app.includes('checkPreviewAndSwitch')],
  ['app.js null fallback', (app.match(/\|\| \{ innerHTML/g) || []).length > 10],
  ['app.js if 保护', app.includes("if ($('#recGrid'))")],
  ['index.html 全局错误捕获', html.includes('unhandledrejection')],
  ['index.html 错误条', html.includes('__errBar')],
  ['source-manager 外链过滤', sm.includes('media\\/outer')],
  ['style.css 歌词放大', css.includes('歌词高亮放大')],
  ['server.js 下载相关', srv.includes('/api/download-dir') && srv.includes('/api/downloads')],
]

console.log('=== 安装包 v1.0.3 校验 ===')
let ok = 0
for (const [n, p] of checks) { console.log('  ' + (p ? '✓' : '✗') + ' ' + n); if (p) ok++ }
console.log('\n通过 ' + ok + '/' + checks.length + '\n')

/* 文件清单 */
console.log('=== 关键文件大小 ===')
for (const [name, content] of [['public/app.js', app], ['public/index.html', html], ['app/lib/source-manager.js', sm], ['public/style.css', css], ['app/server.js', srv]]) {
  console.log('  ' + name.padEnd(28) + (content.length / 1024).toFixed(1) + ' KB')
}
