'use strict'
/* 试听检测阈值太严（只看 <65s），实际 kxh 给的是 179s 的残缺版
   改成：只要明显短于原曲（低于 85%）就换平台 */
const fs = require('node:fs')
const p = 'mobile/www/app.js'
let a = fs.readFileSync(p, 'utf8')

const oldCond = `  /* 原曲明显长于拿到的片段，且片段很短 → 试听版 */
  if (real > 100 && gotDuration < Math.min(65, real * 0.6)) {`

const newCond = `  /* 拿到的时长明显短于原曲 → 判定为残缺/试听版 */
  if (real > 90 && gotDuration < real * 0.85) {`

if (a.includes(oldCond)) {
  a = a.replace(oldCond, newCond)
  fs.writeFileSync(p, a, 'utf8')
  console.log('试听检测阈值已放宽（<85% 原长）')
} else {
  console.log('未匹配条件')
  const i = a.indexOf('function checkPreviewAndSwitch')
  if (i > 0) console.log(a.slice(i, i + 700))
}
