'use strict'
/* 找酷狗歌单名在 HTML 里的位置 */
const fs = require('node:fs')
const h = fs.readFileSync('build/_kg_songlist.html', 'utf8')

const i = h.indexOf('1111')
console.log('"1111" 位置: ' + i)
if (i > 0) console.log('上下文: ' + JSON.stringify(h.slice(Math.max(0, i - 250), i + 120)))

const keys = ['specialname', 'playlist_name', 'songlist_name', 'listname', 'gcinfo', '"name"', '"title"']
for (const k of keys) {
  const j = h.indexOf(k)
  if (j > 0) console.log('\n' + k + ' @' + j + ':\n  ' + JSON.stringify(h.slice(j, j + 160)))
}
