'use strict'
/* 验证 D 批的 DOM / CSS 补齐 */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

const h = fs.readFileSync('public/index.html', 'utf8')
const c = fs.readFileSync('public/style.css', 'utf8')
const a = fs.readFileSync('public/app.js', 'utf8')

console.log('=== 新加的 DOM ===')
const IDS = ['volNum', 'btnLrcBigger', 'btnLrcSmaller', 'btnLrcPlus', 'btnLrcMinus', 'lrcOffsetTip']
let bad = 0
for (const k of IDS) {
  const ok = h.includes('id="' + k + '"')
  if (!ok) bad++
  console.log('  ' + (ok ? '✓' : '✗') + '  #' + k)
}

console.log('\n=== CSS ===')
console.log('  ' + (c.includes('.vol-num') ? '✓' : '✗') + ' .vol-num 样式')
console.log('  ' + (c.includes('.lyric-tools') ? '✓' : '✗') + ' .lyric-tools 样式')
console.log('  ' + (c.includes('body.m-deck /*') ? '✗ 注释仍吞规则' : '✓ 注释已修') + ' .deck-tabs')

console.log('\n=== app.js ===')
const CHECKS = [
  ['coverBox 绑定', "$('#coverBox').onclick"],
  ['openRecDialog 已删', null],
  ['静音修复', 'vol === 0'],
  ['state.settings 赋值', 'state.settings = s'],
  ['取流并发合并', '__srcInflight'],
  ['错误条守卫', '__errBarGuard'],
  ['remove 带 source', 'source: song.source'],
]
for (const [name, key] of CHECKS) {
  let ok
  if (key === null) ok = !a.includes('function openRecDialog')
  else ok = a.includes(key)
  if (!ok) bad++
  console.log('  ' + (ok ? '✓' : '✗') + ' ' + name)
}

console.log('\n' + (bad ? '✗ ' + bad + ' 项未通过' : '✓ 全部通过'))
if (bad) process.exitCode = 1