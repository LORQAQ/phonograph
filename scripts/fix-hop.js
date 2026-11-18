'use strict'
/* 修 proxyStream 签名缺少 hop 参数导致 ReferenceError 崩溃 */
const fs = require('node:fs')
const p = 'app/server.js'
let s = fs.readFileSync(p, 'utf8')

const i = s.indexOf('function proxyStream (')
if (i < 0) { console.log('未找到 proxyStream'); process.exit(1) }
const lineEnd = s.indexOf('\n', i)
const sig = s.slice(i, lineEnd)
console.log('原签名:', sig)

if (!sig.includes('hop')) {
  const newSig = 'function proxyStream (req, res, targetUrl, opts = {}, hop = 0) {'
  s = s.slice(0, i) + newSig + s.slice(lineEnd)
  fs.writeFileSync(p, s, 'utf8')
  console.log('已修复签名:', newSig)
} else {
  console.log('签名已含 hop')
}

/* 顺便确认递归调用也带着 hop */
const rec = s.includes('proxyStream(req, res, next, opts, hop + 1)')
console.log('递归带 hop:', rec)
