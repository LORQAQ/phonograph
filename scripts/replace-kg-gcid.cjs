'use strict'
/* 把 playlist-import.js 里的旧 gcid 实现（HTML 首屏 10 首）换成 kugou-gcid.js（全量分页） */
const path = require('node:path')
process.chdir(path.resolve(__dirname, '..'))
const fs = require('node:fs')
const p = 'app/lib/playlist-import.js'
let s = fs.readFileSync(p, 'utf8')

const START = '  /* gcid 歌单：m.kugou.com/songlist/gcid_xxx/ 是 React SPA，没有公开 API，'
const i = s.indexOf(START)
if (i < 0) {
  console.log('没找到旧实现')
  process.exit(0)
}

/* 从 START 开始，找到 if 块的结束（配平后 + 紧邻的 }） */
const ifIdx = s.indexOf('if (/^gcid_/i.test(String(specialid))', i)
if (ifIdx < 0) { console.log('没找到 if'); process.exit(1) }
const bodyStart = s.indexOf('{', ifIdx)
let d = 0
let end = bodyStart
for (let k = bodyStart; k < s.length; k++) {
  if (s[k] === '{') d++
  else if (s[k] === '}') { d--; if (d === 0) { end = k + 1; break } }
}

const oldBlock = s.slice(i, end)
console.log('旧实现 ' + oldBlock.length + ' 字符，将被替换')

const newBlock = `  /* gcid 歌单：走洛雪那条路 —— batch_decode 解码 → info_v2 拿总数 → song_v2 按 300/页翻。
     之前解析 m.kugou.com 的 HTML 只能拿到 SSR 首屏 10 首，?page=2 无效。 */
  if (/^gcid_/i.test(String(specialid)) || /^[a-z0-9]{14,}$/i.test(String(specialid))) {
    const kgGcid = require('./kugou-gcid.js')
    const gid = String(specialid).startsWith('gcid_') ? String(specialid) : 'gcid_' + String(specialid)
    const r = await kgGcid.fetchGcidPlaylist(gid, { maxSongs: 2000 })
    return { platform: 'kg', name: r.name || '酷狗歌单', cover: r.cover || '', songs: r.songs }
  }`

s = s.slice(0, i) + newBlock + s.slice(end)
fs.writeFileSync(p, s, 'utf8')
console.log('✓ 已替换')
