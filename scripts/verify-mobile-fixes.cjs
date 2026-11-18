'use strict'
/* 验证 BUG-REPORT 里的手机端修复 */
const fs = require('node:fs')

const a = fs.readFileSync('mobile/www/api-mobile.js', 'utf8')
const e = fs.readFileSync('mobile/www/lib/lx-engine-web.js', 'utf8')

const checks = [
  ['B1 preview 返回 {preview, songs}', a.includes('preview: { name: r0.name')],
  ['B1 import 返回 {playlists, imported}', a.includes('imported: { id: pl.id')],
  ['B2 add 兼容 listId', a.includes('body.listId || body.id')],
  ['B2 remove 分支', a.includes("action === 'remove'")],
  ['B2 去重键含平台', a.includes("(s.source || 'wy') + '|' + String(s.id)")],
  ['B18 已删除 /api/stream', !a.includes("p === '/api/stream'")],
  ['B19 外链占位已拦', a.includes('外链占位不采用')],
  ['B8 loadAll 释放锁', e.includes('this.loading = null')],
  ['B9 禁用音源过滤', e.includes('isDisabled')],
  ['B24 logs 数组', e.includes('this.logs = []')],
  ['fish 优先', e.includes('先单独试 fish')],
  ['外链过滤', e.includes('media\\/outer')],
  ['硬超时', e.includes('硬超时')],
]

console.log('=== BUG-REPORT 手机端修复验证 ===')
let ok = 0
for (const [n, p] of checks) {
  console.log('  ' + (p ? '✓' : '✗') + ' ' + n)
  if (p) ok++
}
console.log('\n通过 ' + ok + '/' + checks.length)

/* 顺带统计文件大小 */
console.log('\n=== 文件 ===')
console.log('  api-mobile.js     ' + (a.length / 1024).toFixed(1) + ' KB')
console.log('  lx-engine-web.js  ' + (e.length / 1024).toFixed(1) + ' KB')
