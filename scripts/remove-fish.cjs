'use strict'
/* 从 KEEP 和 PRIO 里移除 fish（625KB，解析时卡死主线程） */
const fs = require('node:fs')

const files = ['mobile/www/api-mobile.js', 'mobile/www/lib/lx-engine-web.js']
let total = 0

for (const f of files) {
  if (!fs.existsSync(f)) continue
  let s = fs.readFileSync(f, 'utf8')
  const before = s

  /* 把数组里的 ', 'fish' 去掉 */
  s = s.split(", 'fish'").join('')
  s = s.split(', "fish"').join('')

  if (s !== before) {
    fs.writeFileSync(f, s, 'utf8')
    const n = (before.match(/'fish'/g) || []).length - (s.match(/'fish'/g) || []).length
    console.log(f + ': 移除 fish ' + n + ' 处')
    total += n
  } else {
    console.log(f + ': 无需修改')
  }
}

console.log('\n=== 修改结果 ===')
for (const f of files) {
  if (!fs.existsSync(f)) continue
  const s = fs.readFileSync(f, 'utf8')
  s.split('\n').forEach((l, i) => {
    if (/const (KEEP|PRIO)/.test(l)) console.log('  ' + f + ' L' + (i + 1) + ': ' + l.trim())
  })
}
console.log('\n共移除: ' + total + ' 处')
