'use strict'
/* audit6 单元测试：上游畸形数据在 mapSong 系列里的表现 */
const qq = require('../../app/lib/qq.js')
const kugou = require('../../app/lib/kugou.js')
const netease = require('../../app/lib/netease.js')
const kgGcid = require('../../app/lib/kugou-gcid.js')

const cases = [
  ['qq.mapSong({singer:"周杰伦"})', () => qq.mapSong({ songmid: 'x1', songname: 'A', singer: '周杰伦' })],
  ['qq.mapSong(null)', () => qq.mapSong(null)],
  ['kugou.mapSong(null)', () => kugou.mapSong(null)],
  ['kugou.mapSong({authors:非数组}) 需走 toplist', () => kugou.mapSong({ hash: 'h', songname: 'A', duration: 'ab:cd' })],
  ['netease.mapSong({ar:{}})', () => netease.mapSong({ id: 1, name: 'A', ar: {}, al: { name: 'B' } })],
  ['netease.mapSong(null)', () => netease.mapSong(null)],
  ['kgGcid.mapKgSong(null)', () => kgGcid.mapKgSong(null)],
  ['kgGcid.mapKgSong({hash:x,duration:"abc"})', () => kgGcid.mapKgSong({ hash: 'h1', filename: 'A - B', duration: 'abc' })],
  ['kgGcid.mapKgSong({hash:x,cover:[]})', () => kgGcid.mapKgSong({ hash: 'h2', filename: 'A - B', cover: [] })],
]
for (const [name, fn] of cases) {
  try {
    const r = fn()
    console.log('OK   ' + name + ' => ' + JSON.stringify(r && { id: r.id, name: r.name, singer: r.singer, duration: r.duration, cover: r.cover }))
  } catch (e) {
    console.log('THROW ' + name + ' => ' + e.constructor.name + ': ' + e.message)
  }
}
/* 非法 duration 的数值传播 */
const bad = kgGcid.mapKgSong({ hash: 'h3', filename: 'C - D', duration: 'abc' })
console.log('duration(NaN) JSON 化 => ' + JSON.stringify({ duration: bad.duration, durationText: bad.durationText }))