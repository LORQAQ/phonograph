'use strict'
/* 检查 assemble 的三个补丁锚点是否还有效 */
const fs = require('node:fs')
const s = fs.readFileSync('public/app.js', 'utf8')

const a1 = "return '/api/pic?source=' + (song.source || 'wy') + '&id=' + encodeURIComponent(song.id)"
const a2 = "img.src = '/api/pic?' + q"
const a3 = [
  'function reloadCurrent () {',
  '  if (!state.currentSong) return',
  '  const t = audio.currentTime',
  "  audio.src = '/api/stream?' + songParams(state.currentSong).toString()",
].join('\n')

console.log('锚点1 (pic 绝对路径): ' + (s.includes(a1) ? '✓ 命中' : '✗ 失效'))
console.log('锚点2 (封面取色):     ' + (s.includes(a2) ? '✓ 命中' : '✗ 失效'))
console.log('锚点3 (reloadCurrent):' + (s.includes(a3) ? '✓ 命中' : '✗ 失效（已过时，应删除）'))

/* 顺便看 reloadCurrent 现在长什么样 */
const i = s.indexOf('async function reloadCurrent')
if (i > 0) {
  console.log('\n=== 当前 reloadCurrent 开头 ===')
  console.log(s.slice(i, i + 300))
}
