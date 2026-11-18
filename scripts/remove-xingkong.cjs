'use strict'
/* xingkong 在手机上 init 会同步卡死，从手机端移除；电脑端保留 */
const fs = require('node:fs')

const files = ['mobile/www/api-mobile.js', 'mobile/www/lib/lx-engine-web.js']
for (const f of files) {
  if (!fs.existsSync(f)) continue
  let s = fs.readFileSync(f, 'utf8')
  const before = s
  s = s.split(", 'xingkong'").join('')
  s = s.split(', "xingkong"').join('')
  if (s !== before) {
    fs.writeFileSync(f, s, 'utf8')
    console.log(f + ': 移除 xingkong')
  }
}

console.log('\n=== 当前配置 ===')
for (const f of files) {
  if (!fs.existsSync(f)) continue
  const s = fs.readFileSync(f, 'utf8')
  s.split('\n').forEach((l, i) => {
    if (/const (KEEP|PRIO)/.test(l)) console.log('  ' + l.trim())
  })
}
