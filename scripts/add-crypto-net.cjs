'use strict'
/* 给 server.js 补 crypto / net 依赖 */
const fs = require('node:fs')
const p = 'app/server.js'
let s = fs.readFileSync(p, 'utf8')

if (s.includes("require('node:crypto')")) {
  console.log('已有 crypto')
} else {
  const anchor = "const os = require('node:os')"
  if (!s.includes(anchor)) { console.log('⚠ 锚点未找到'); process.exit(1) }
  s = s.replace(anchor, anchor + "\nconst crypto = require('node:crypto')\nconst net = require('node:net')")
  fs.writeFileSync(p, s, 'utf8')
  console.log('✓ 已加 crypto + net')
}
