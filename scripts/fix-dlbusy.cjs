'use strict'
/* 给 downloadSong 的所有出口补 dlBusy 释放 */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

const p = 'public/app.js'
let s = fs.readFileSync(p, 'utf8')
const lines = s.split('\n')

/* 定位 downloadSong */
let start = -1
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('function downloadSong (song) {')) { start = i; break }
}
if (start < 0) { console.log('没找到 downloadSong'); process.exit(1) }

/* 找函数结束（配平） */
let depth = 0
let end = -1
let started = false
for (let i = start; i < lines.length; i++) {
  for (const ch of lines[i]) {
    if (ch === '{') { depth++; started = true }
    else if (ch === '}') { depth--; if (started && depth === 0) { end = i; break } }
  }
  if (end >= 0) break
}
if (end < 0) { console.log('没找到函数结尾'); process.exit(1) }
console.log('downloadSong: L' + (start + 1) + ' ~ L' + (end + 1))

/* 逐行检查 return，给它前面插入释放（如果该 return 不是「dlBusy 检查」那条） */
let added = 0
for (let i = start + 1; i < end; i++) {
  const l = lines[i]
  const t = l.trim()

  /* 跳过 dlBusy 的检查 return（那条是在置位之前的） */
  if (i === start + 13 || t.includes('已有下载在进行')) continue

  /* 单行 return toast / return */
  if (/^return\b/.test(t) || /^\} else return\b/.test(t)) {
    const indent = l.match(/^\s*/)[0]
    /* 如果同一行就已经有 dlBusy = false 就跳过 */
    if (l.includes('dlBusy')) continue
    lines[i] = indent + 'state.dlBusy = false\n' + l
    added++
  }
}

/* 函数最后也要释放（防止走到末尾没 return） */
const lastIndent = '  '
lines.splice(end, 0, lastIndent + 'state.dlBusy = false')
added++

fs.writeFileSync(p, lines.join('\n'), 'utf8')
console.log('✓ 补了 ' + added + ' 处释放')
