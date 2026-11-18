'use strict'
/* 校验 1.0.6 安装包内容 */
const fs = require('node:fs')
const { execSync } = require('node:child_process')

const exe = '留声-1.0.6-安装包.exe'
const b = fs.readFileSync(exe)
console.log('安装包: ' + (b.length / 1048576).toFixed(1) + ' MB')

const start = b.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
console.log('ZIP 偏移: ' + start)
fs.mkdirSync('build', { recursive: true })
fs.writeFileSync('build/_v6.zip', b.slice(start))

function ex (p) {
  try { return execSync('tar.exe -xOf build/_v6.zip ' + p, { encoding: 'utf8', maxBuffer: 80000000 }) } catch (e) { return '' }
}

const srv = ex('./app/server.js')
const app = ex('./public/app.js')
const html = ex('./public/index.html')

const checks = [
  ['B3 切歌 token 校验', app.includes('if (token !== state.playToken) return')],
  ['B4 空 src 走 removeAttribute', app.includes("audio.removeAttribute('src')")],
  ['B5 退出前落盘', srv.includes('writeDbNow()') && srv.includes('数据已保存')],
  ['B6 db 原子写（rename）', srv.includes('fs.renameSync(tmp, DB_FILE)')],
  ['B6 损坏备份', srv.includes('已备份到')],
  ['B10 删除扩展名白名单', srv.includes('只能删除音频文件')],
  ['B10 路径 relative 校验', srv.includes('rel.startsWith(\'..\')')],
  ['B23 去重含平台', srv.includes("(s.source || 'wy') === (body.song.source || 'wy')")],
  ['S1 默认监听本机', srv.includes("PHONOGRAPH_LAN === '1'")],
  ['S4 静态路径边界', srv.includes('__rel.startsWith')],
  ['接口 stream 复用 url', srv.includes('resolveWithCross') && srv.includes("async '/api/stream'")],
  ['前端残缺检测', app.includes('checkPreviewAndSwitch')],
  ['前端 null fallback', (app.match(/\|\| \{ innerHTML/g) || []).length > 10],
  ['全局错误捕获', html.includes('unhandledrejection')],
]

console.log('\n=== 安装包内容校验 ===')
let ok = 0
for (const [n, p] of checks) {
  console.log('  ' + (p ? '✓' : '✗') + ' ' + n)
  if (p) ok++
}
console.log('\n通过 ' + ok + '/' + checks.length)

/* 清理 */
try { fs.unlinkSync('build/_v6.zip') } catch (e) { }
