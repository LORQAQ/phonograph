'use strict'
/* 读 download-dir 完整实现 */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

const s = fs.readFileSync('app/server.js', 'utf8')
const key = "'/api/download-dir'"
const i = s.indexOf(key)
if (i < 0) { console.log('找不到'); process.exit(1) }

const bs = s.indexOf('{', i)
let d = 0
let e = bs
for (let k = bs; k < s.length; k++) {
  if (s[k] === '{') d++
  else if (s[k] === '}') { d--; if (d === 0) { e = k + 1; break } }
}
console.log(s.slice(i, e))
