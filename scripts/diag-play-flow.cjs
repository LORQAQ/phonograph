'use strict'
/* 分析换歌流程的阻塞点 */
const fs = require('node:fs')
const a = fs.readFileSync('mobile/www/app.js', 'utf8')
const lines = a.split('\n')

console.log('=== playSong / playAt 主流程 ===')
const cands = ['async function playSong', 'async function playAt', 'function playSong', 'async function play(']
for (const c of cands) {
  const i = a.indexOf(c)
  if (i > 0) {
    const lineNo = a.slice(0, i).split('\n').length
    console.log('\n--- ' + c + ' (L' + lineNo + ') ---')
    console.log(a.slice(i, i + 2200))
    break
  }
}

console.log('\n=== 换歌相关：loadLyric / streamSrc 调用点 ===')
lines.forEach((l, i) => {
  if (/await loadLyric|await streamSrc|loadLyric\(|streamSrc\(|preloadNext|loadCover/.test(l)) {
    console.log('  L' + (i + 1) + ': ' + l.trim().slice(0, 120))
  }
})
