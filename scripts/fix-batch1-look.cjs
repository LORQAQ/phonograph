'use strict'
/* 第 1 批修复：B1 / B2 / B52 / B53（都在 public/app.js，源头） */
const fs = require('node:fs')

const p = 'public/app.js'
let s = fs.readFileSync(p, 'utf8')
const done = []
const fail = []

/* ============ B1 音源在线导入 ============ */
const b1old = `const url = $('#importUrl') || { value: '', style: {}, classList: { add () {}, remove () {} } }.value.trim()`

/* 先看实际代码长什么样 */
const b1idx = s.indexOf('importUrl')
let b1ctx = ''
if (b1idx > 0) b1ctx = s.slice(Math.max(0, b1idx - 300), b1idx + 700)
console.log('=== B1 现场 ===')
console.log(b1ctx.slice(0, 900))
