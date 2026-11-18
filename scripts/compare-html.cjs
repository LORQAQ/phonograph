'use strict'
/* 对比两个 index.html，确认当前的是否被截断 */
const fs = require('node:fs')

function stat (p, label) {
  if (!fs.existsSync(p)) { console.log(label + ': 不存在'); return null }
  const h = fs.readFileSync(p, 'utf8')
  const ids = [...h.matchAll(/id="([^"]+)"/g)].map((m) => m[1])
  console.log('\n=== ' + label + ' ===')
  console.log('  路径   ' + p)
  console.log('  大小   ' + (h.length / 1024).toFixed(1) + ' KB')
  console.log('  id 数  ' + ids.length)
  console.log('  结尾   ' + JSON.stringify(h.slice(-80)))
  return { h, ids }
}

const cur = stat('public/index.html', '当前（lx-music-clone）')
const inst = stat('D:/Phonograph/public/index.html', '安装版（D:\\Phonograph）')

const need = ['panelList', 'recGrid', 'newList', 'leaderBody', 'qqCookie', 'dlDir', 'importUrl', 'speedResult']
console.log('\n=== 关键容器 ===')
console.log('  ' + 'id'.padEnd(16) + '当前    安装版')
for (const n of need) {
  const a = cur && cur.ids.includes(n) ? '✓' : '✗'
  const b = inst && inst.ids.includes(n) ? '✓' : '✗'
  console.log('  ' + n.padEnd(16) + a.padEnd(8) + b)
}

/* 结论 */
if (cur && inst && inst.ids.length > cur.ids.length) {
  console.log('\n结论：安装版更完整（' + inst.ids.length + ' vs ' + cur.ids.length + '），当前 HTML 缺内容')
} else if (cur && inst && cur.ids.length === inst.ids.length) {
  console.log('\n结论：两个一样完整')
}
