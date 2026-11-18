'use strict'
/* 手机端关键修复：index.html 里的绝对路径 /xxx 会导致 appassets 下 404（无样式=图标爆炸） */
const fs = require('node:fs')
const p = 'mobile/www/index.html'
let h = fs.readFileSync(p, 'utf8')

const before = h
/* 把 href="/xxx" 和 src="/xxx" 改成相对路径 */
h = h.replace(/(href|src)="\/(?!\/)/g, '$1="')
/* icon 也处理 */
h = h.replace(/(href)="(icon-[^"]*)"/g, '$1="$2"')

if (h !== before) {
  fs.writeFileSync(p, h, 'utf8')
  console.log('手机端 index.html 路径已改为相对')
} else {
  console.log('没有需要改的路径')
}

/* 校验 */
const lines = h.split('\n')
console.log('\n=== 修改后的引用 ===')
for (const l of lines) {
  if (/style\.css|app\.js|sources-data|icon-\d|lib\//.test(l)) {
    console.log('  ' + l.trim().slice(0, 100))
  }
}
