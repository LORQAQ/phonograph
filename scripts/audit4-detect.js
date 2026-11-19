'use strict'
/* Audit fixture: detect() + fromKugou 的 gcid 分支判定表 */
process.chdir(require('node:path').join(__dirname, '..'))
const { detect } = require('../app/lib/playlist-import.js')

const cases = [
  'https://m.kugou.com/songlist/gcid_3znx57dpz2tz0b7/',
  'https://m.kugou.com/songlist/GCID_3ZNX57DPZ2TZ0B7/',
  'https://www.kugou.com/songlist/3znx57dpz2tz0b7',
  'https://www.kugou.com/songlist/1234567890',
  'https://www.kugou.com/songlist/12345678901234',
  'https://www.kugou.com/songlist/share2024',
  'https://www.kugou.com/songlist/index.html',
  'https://www.kugou.com/yy/special/single/1234567.html',
  'https://m.kugou.com/plist/list/123456789?specialid=98765',
  'https://www.kugou.com/song/#hash=ABCDEF&album_id=1',
  'https://music.163.com/playlist?id=24381616',
  'https://y.qq.com/n/ryqq/playlist/7654321',
  'https://kugou.com/songlist/',
  'gcid_3znx57dpz2tz0b7',
]

for (const c of cases) {
  let r
  try { r = JSON.stringify(detect(c)) } catch (e) { r = 'THROW ' + e.message }
  console.log(String(c).padEnd(55), '=>', r)
}

/* fromKugou 的分支条件（与代码同式） */
const isGcidBranch = (id) => /^gcid_/i.test(String(id)) || /^[a-z0-9]{14,}$/i.test(String(id))
console.log('\n--- fromKugou 分支判定 ---')
for (const id of ['gcid_3znx57dpz2tz0b7', 'GCID_3ZNX57DPZ2TZ0B7', '3znx57dpz2tz0b7', '1234567890', '12345678901234', 'ABCDEF12345678']) {
  const prefix = String(id).startsWith('gcid_') ? String(id) : 'gcid_' + String(id)
  console.log(String(id).padEnd(24), 'gcid分支=' + isGcidBranch(id), ' 实际前缀处理 =>', prefix)
}
