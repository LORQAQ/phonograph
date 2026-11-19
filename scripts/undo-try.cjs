'use strict'
/* 撤销 P1-5 引入的未闭合 try */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

const p = 'public/app.js'
let s = fs.readFileSync(p, 'utf8')

/* 找 `state.dlBusy = true` 后面紧跟的 `try {` */
const marker = 'state.dlBusy = true'
const i = s.indexOf(marker)
if (i < 0) { console.log('没找到 dlBusy'); process.exit(0) }

const lines = s.split('\n')
let tryLine = -1
for (let k = 0; k < lines.length; k++) {
  if (lines[k].includes(marker)) {
    /* 看接下来 3 行有没有 try */
    for (let j = k + 1; j < Math.min(k + 4, lines.length); j++) {
      if (/^\s*try\s*\{\s*$/.test(lines[j])) { tryLine = j; break }
    }
    break
  }
}

if (tryLine >= 0) {
  console.log('找到未闭合的 try 在 L' + (tryLine + 1) + ': ' + JSON.stringify(lines[tryLine]))
  lines.splice(tryLine, 1)
  fs.writeFileSync(p, lines.join('\n'), 'utf8')
  console.log('✓ 已删除')
} else {
  console.log('没找到紧邻的 try，扫描整个 dlBusy 区域')
  const seg = s.slice(Math.max(0, i - 200), i + 800)
  console.log(seg)
}
