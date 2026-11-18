'use strict'
/* mkdirSync 不支持 Buffer，改回 string；文件名保留 Buffer 写入 */
const fs = require('node:fs')
const p = 'app/server.js'
let s = fs.readFileSync(p, 'utf8')

s = s.split("fs.mkdirSync(Buffer.from(dir, 'utf8'), { recursive: true })")
  .join("fs.mkdirSync(dir, { recursive: true })")
s = s.split("fs.mkdirSync(Buffer.from(wantDir, 'utf8'), { recursive: true })")
  .join("fs.mkdirSync(wantDir, { recursive: true })")

fs.writeFileSync(p, s, 'utf8')
console.log('mkdir 已改回 string:', s.includes("fs.mkdirSync(dir, { recursive: true })"))
