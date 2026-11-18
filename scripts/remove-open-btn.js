'use strict'
/* 删除设置页「打开」按钮的绑定代码与按钮本身 */
const fs = require('node:fs')
const p = 'public/app.js'
let s = fs.readFileSync(p, 'utf8')

/* 1) 按钮（可能还有残留） */
s = s.replace(/\s*<button class="btn-mini" id="dlDirOpen">打开<\/button>/, '')

/* 2) 绑定块：从 $('#dlDirOpen').onclick 到匹配的 }) 或 } */
const marker = "$('#dlDirOpen')"
let idx = s.indexOf(marker)
let removed = 0
while (idx > 0) {
  /* 往前找到行首 */
  const lineStart = s.lastIndexOf('\n', idx) + 1
  /* 往后找匹配的结束：找到第一个 "\n    }" 或 "\n  }" 且括号平衡 */
  let depth = 0
  let end = idx
  for (let i = idx; i < s.length; i++) {
    const ch = s[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) { end = i + 1; break }
    }
  }
  /* 吃掉后面的分号/换行 */
  while (end < s.length && /[\s;]/.test(s[end])) end++
  s = s.slice(0, lineStart) + s.slice(end)
  removed++
  idx = s.indexOf(marker)
}

fs.writeFileSync(p, s, 'utf8')
console.log('删除绑定块:', removed, '个')
console.log('剩余 dlDirOpen:', (s.match(/dlDirOpen/g) || []).length)
