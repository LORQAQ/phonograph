'use strict'
/* 统一放大字号 + 换圆润字体（雅黑 UI） */
const fs = require('node:fs')
const p = 'public/style.css'
let s = fs.readFileSync(p, 'utf8')

s = s.replace('--ui:"DengXian","Microsoft YaHei UI","Microsoft YaHei",sans-serif;',
  '--ui:"Microsoft YaHei UI","Microsoft YaHei","Segoe UI Variable Text","Segoe UI",sans-serif;')

let count = 0
s = s.replace(/font-size:(\d+(?:\.\d+)?)px/g, (m, n) => {
  count++
  const v = parseFloat(n) + 1
  return 'font-size:' + (Number.isInteger(v) ? v : v.toFixed(1)) + 'px'
})

s = s.replace(/clamp\(18px,\s*1\.35vw,\s*24px\)/g, 'clamp(20px,1.45vw,27px)')
s = s.replace(/clamp\(11px,\s*\.92vw,\s*13\.5px\)/g, 'clamp(12px,1vw,14.5px)')

fs.writeFileSync(p, s, 'utf8')
console.log('font-size 调整:', count, '处')
