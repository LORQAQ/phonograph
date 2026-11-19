'use strict'
/* 审计用：解析 m.kugou.com songlist 页里的 window.$output，看真实字段与歌曲数量 */
const fs = require('node:fs')
const path = require('node:path')
const html = fs.readFileSync(path.join(__dirname, '..', 'build', '_audit4_gcid.html'), 'utf8')
const m = /window\.\$output\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/.exec(html)
if (!m) { console.log('no $output'); process.exit(1) }
let out
try { out = JSON.parse(m[1]) } catch (e) { console.log('parse fail', e.message); process.exit(1) }
const info = out.info || {}
const li = info.listinfo || {}
console.log('encode_gic =', out.encode_gic)
console.log('listinfo keys =', Object.keys(li).join(','))
console.log('name/count =', li.name, li.count, 'global_collection_id=', JSON.stringify(li.global_collection_id), 'list_create_gid=', JSON.stringify(li.list_create_gid))
console.log('info keys =', Object.keys(info).join(','))
const songs = info.songs || info.list || info.songlist || []
console.log('songs array len =', Array.isArray(songs) ? songs.length : typeof songs)
if (Array.isArray(songs) && songs[0]) {
  console.log('song keys =', Object.keys(songs[0]).join(','))
  console.log('song[0] =', JSON.stringify(songs[0]).slice(0, 700))
  const withRemark = songs.filter((s) => s.remark)
  console.log('带 remark 的歌:', withRemark.length, withRemark.slice(0, 2).map((s) => ({ filename: s.filename, remark: s.remark })))
  const durs = songs.map((s) => s.duration).filter(Boolean)
  console.log('duration 样本:', durs.slice(0, 10), 'median-ish:', durs.sort((a, b) => a - b)[Math.floor(durs.length / 2)])
  console.log('timelen 样本:', songs.map((s) => s.timelen).slice(0, 5))
  console.log('singerinfo 样本:', JSON.stringify(songs.slice(0, 2).map((s) => s.singerinfo)).slice(0, 300))
}
