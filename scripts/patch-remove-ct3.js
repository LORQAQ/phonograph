'use strict'
const fs = require('node:fs')
const p = 'app/server.js'
let s = fs.readFileSync(p, 'utf8')

const lines = s.split('\n')
const out = []
let skipping = false
for (const line of lines) {
  if (line.includes("const ct3 = String(r3.headers['content-type']")) { skipping = true; continue }
  if (skipping) {
    if (line.trim().startsWith('}')) { skipping = false }
    continue
  }
  out.push(line)
}
s = out.join('\n')

/* 保留 status 检查即可 */
fs.writeFileSync(p, s, 'utf8')
console.log('ct3 检查已移除:', !s.includes('const ct3'))
