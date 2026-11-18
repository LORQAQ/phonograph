'use strict'
/* 修复 $().forEach 致命错误（boot 中断导致整站不可用） */
const fs = require('node:fs')
const p = 'public/app.js'
let lines = fs.readFileSync(p, 'utf8').split('\n')

/* 1) 所有 "$(...).forEach" 改成 "$$(...).forEach" */
let fixed = 0
lines = lines.map((l) => {
  if (/\$\([^)$]*\)\.forEach/.test(l) && !/\$\$\(/.test(l)) {
    fixed++
    return l.replace(/\$\(([^)]*)\)\.forEach/g, (m, sel) => '$$(' + sel + ').forEach')
  }
  return l
})

/* 2) 去掉重复的 .dl-fmt 绑定块（保留后面那个正确的） */
const text = lines.join('\n')
const dupStart = text.indexOf("  $('.dl-fmt').forEach((b) => {")
const dupStart2 = text.indexOf("  $$('.dl-fmt').forEach((b) => {")
let out = text
if (dupStart2 > 0) {
  /* 如果 $$ 版本已存在，删掉所有 $ 版本（前面已统一成 $$，这里按块删） */
  const blocks = []
  let idx = 0
  while ((idx = out.indexOf("  $$('.dl-fmt').forEach((b) => {", idx)) >= 0) {
    blocks.push(idx)
    idx += 10
  }
  if (blocks.length > 1) {
    /* 删除第一处重复块（到匹配的 }） */
    const start = blocks[0]
    const endMarker = "\n  }\n"
    const end = out.indexOf(endMarker, start)
    if (end > 0) {
      out = out.slice(0, start) + out.slice(end + endMarker.length)
    }
  }
}

fs.writeFileSync(p, out, 'utf8')
console.log('修复 $().forEach 处数:', fixed)
console.log('剩余 $().forEach:', (out.match(/\$\([^)$]*\)\.forEach/g) || []).length)
