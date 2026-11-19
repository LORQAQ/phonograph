'use strict'
/* 检查两端酷狗歌单支持情况 */
const fs = require('node:fs')

console.log('=== 手机端 mobile/www/api-mobile.js ===')
const m = fs.readFileSync('mobile/www/api-mobile.js', 'utf8')
console.log('  gcid_ 解析:', m.includes('gcid_') ? '✓' : '✗')
console.log('  listinfo 歌单名:', m.includes('listinfo') ? '✓' : '✗')
console.log('  "songs":[ 数组解析:', m.includes('"songs":[') ? '✓' : '✗')
console.log('  getSongInfo 取流:', m.includes('getSongInfo') ? '✓' : '✗')
console.log('  special/single:', m.includes('special/single') ? '✓' : '✗')

console.log('\n=== 电脑端 app/lib/playlist-import.js ===')
const c = fs.readFileSync('app/lib/playlist-import.js', 'utf8')
console.log('  gcid:', c.includes('gcid') ? '✓' : '✗  ← 需要修')
console.log('  special/single:', c.includes('special/single') ? '✓' : '✗')
console.log('  mobilecdn:', c.includes('mobilecdn.kugou.com') ? '✓' : '✗')

/* 找 detect 里的酷狗分支 */
const i = c.indexOf("if (/kugou\\.com/.test(s))")
if (i > 0) {
  console.log('\n=== 电脑端 detect 的酷狗分支 ===')
  console.log(c.slice(i, i + 500))
}

/* 找 fromKugou */
const k = c.indexOf('fromKugou')
if (k > 0) {
  console.log('\n=== 电脑端 fromKugou 开头 ===')
  console.log(c.slice(k, k + 700))
}
