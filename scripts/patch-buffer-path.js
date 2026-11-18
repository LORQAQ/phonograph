'use strict'
/* 用 Buffer 路径写文件，绕过 Windows 下的 ANSI 转换 */
const fs = require('node:fs')
const p = 'app/server.js'
let s = fs.readFileSync(p, 'utf8')

s = s.split("pipeline(r3, fs.createWriteStream(tmp))")
  .join("pipeline(r3, fs.createWriteStream(Buffer.from(tmp, 'utf8')))")

/* mkdir 也用 Buffer */
s = s.split("fs.mkdirSync(dir, { recursive: true })")
  .join("fs.mkdirSync(Buffer.from(dir, 'utf8'), { recursive: true })")

/* rename 用 Buffer */
s = s.split("fs.renameSync(tmp, fullLong)")
  .join("fs.renameSync(Buffer.from(tmp, 'utf8'), Buffer.from(fullLong, 'utf8'))")

/* stat 用 Buffer */
s = s.split("const st = fs.statSync(tmp)")
  .join("const st = fs.statSync(Buffer.from(tmp, 'utf8'))")

fs.writeFileSync(p, s, 'utf8')
console.log('Buffer 路径已应用:', s.includes("createWriteStream(Buffer.from(tmp"))
