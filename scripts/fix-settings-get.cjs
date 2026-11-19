'use strict'
/* /api/settings 同时支持 GET（读）和 POST（写），不能进强制 POST 列表 */
const fs = require('node:fs')
const p = 'app/server.js'
let s = fs.readFileSync(p, 'utf8')

const target = "        '/api/settings',\n"
if (s.includes(target)) {
  s = s.replace(target, '')
  fs.writeFileSync(p, s, 'utf8')
  console.log('✓ 已把 /api/settings 移出 WRITE_PATHS')
} else {
  /* 宽松：找 WRITE_PATHS 块里所有行 */
  const i = s.indexOf('const WRITE_PATHS = new Set([')
  if (i > 0) {
    const end = s.indexOf('])', i) + 2
    const block = s.slice(i, end)
    console.log('当前 WRITE_PATHS:')
    console.log(block)
    const nb = block.replace(/\s*'\/api\/settings',?\n/g, '\n')
    if (nb !== block) {
      s = s.slice(0, i) + nb + s.slice(end)
      fs.writeFileSync(p, s, 'utf8')
      console.log('✓ 已移除 /api/settings（宽松）')
    } else {
      console.log('⚠ 未找到 /api/settings 在列表里')
    }
  } else {
    console.log('⚠ WRITE_PATHS 未找到')
  }
}
