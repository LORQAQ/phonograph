'use strict'
/* 检查 P1 修复状态 + 精确定位 B63 */
process.chdir(require('node:path').resolve(__dirname, '..'))
const fs = require('node:fs')
const s = fs.readFileSync('public/app.js', 'utf8')

console.log('=== P1 修复状态 ===')
console.log('P1-1 B69 TDZ:', (s.includes('wrap.dataset.forSel = sel.id') && !s.includes('try { wrap.dataset.forSel')) ? '✓' : '✗')
console.log('P1-2 B87 清空:', s.includes("elName.textContent = '未在播放'") ? '✓' : '✗')
console.log('P1-3 B63 r0:', s.includes('let r0 = null') ? '✓' : '✗ 未修')
console.log('P1-4 B66 seq:', s.includes('searchSeq') ? '✓' : '✗')
console.log('P1-5 B55 forceFresh:', s.includes('streamSrc(state.currentSong, ') ? '✓' : '✗')

const cntFF = (s.match(/streamSrc\(state\.currentSong, '', true\)/g) || []).length
console.log('   forceFresh 调用点:', cntFF + ' 处')

console.log('\n=== B63 现场 ===')
const i = s.indexOf("const r0 = await api('/api/download?'")
if (i > 0) {
  const ls = s.lastIndexOf('\n', i - 1) + 1
  console.log('声明行 ' + (s.slice(0, i).split('\n').length) + ': ' + JSON.stringify(s.slice(ls, ls + 90)))
}
const j = s.indexOf('r0 && r0.error')
if (j > 0) {
  const ls = s.lastIndexOf('\n', j - 1) + 1
  console.log('引用行 ' + (s.slice(0, j).split('\n').length) + ': ' + JSON.stringify(s.slice(ls, ls + 100)))
}

/* 看这两个行之间有没有块边界 */
if (i > 0 && j > i) {
  const between = s.slice(i, j)
  const openBraces = (between.match(/\{/g) || []).length
  const closeBraces = (between.match(/\}/g) || []).length
  console.log('\n两处之间的 { } 净差: ' + (openBraces - closeBraces) + '（>0 说明 r0 在外层不可见）')
  console.log('两处之间包含 catch:', between.includes('catch'))
}
