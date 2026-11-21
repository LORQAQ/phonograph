'use strict'
/* 给所有 .map(mapSong) 加 .filter(Boolean)，防止 null 条目进列表 */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

const TARGETS = [
  ['app/lib/qq.js', 'list: list.map(mapSong) }', 'list: list.map(mapSong).filter(Boolean) }'],
  ['app/lib/qq.js', '.map((x) => x.data).filter(Boolean).map(mapSong)', '.map((x) => x.data).filter(Boolean).map(mapSong).filter(Boolean)'],
  ['app/lib/netease.js', 'list: songs.map(mapSong),', 'list: songs.map(mapSong).filter(Boolean),'],
  ['app/lib/netease.js', 'list: pl.tracks.map(mapSong) }', 'list: pl.tracks.map(mapSong).filter(Boolean) }'],
  ['app/lib/netease.js', 'const list = ids.map((id) => byId.get(String(id))).filter(Boolean).map(mapSong)', 'const list = ids.map((id) => byId.get(String(id))).filter(Boolean).map(mapSong).filter(Boolean)'],
  ['app/lib/netease.js', 'return list.map((x) => x.song).filter(Boolean).map(mapSong)', 'return list.map((x) => x.song).filter(Boolean).map(mapSong).filter(Boolean)'],
  ['app/lib/kugou.js', 'list: list.map(mapSong) }', 'list: list.map(mapSong).filter(Boolean) }'],
]

let done = 0
const miss = []
for (const [f, a, b] of TARGETS) {
  let s = fs.readFileSync(f, 'utf8')
  if (s.includes(a)) {
    while (s.includes(a)) s = s.replace(a, () => b)
    fs.writeFileSync(f, s, 'utf8')
    done++
  } else {
    miss.push(f + ' :: ' + a.slice(0, 50))
  }
}
console.log('✓ 加了 ' + done + ' 处 filter(Boolean)')
if (miss.length) { console.log('未匹配:'); miss.forEach((m) => console.log('  ⚠ ' + m)) }