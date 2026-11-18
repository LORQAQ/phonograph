'use strict'
/* 找歌词层怎么打开的，把 paintLyricBg 接进去 */
const fs = require('node:fs')

const a = fs.readFileSync('mobile/www/app.js', 'utf8')
const lines = a.split('\n')

console.log('=== 含 lyric 的行 ===')
lines.forEach((l, i) => {
  if (/lyric|Lyric/.test(l) && !/lyric-line|lyric-lines/.test(l)) {
    console.log('L' + (i + 1) + ': ' + l.trim().slice(0, 120))
  }
})
