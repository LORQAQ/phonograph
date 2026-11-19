'use strict'
/* 实测 kugou-gcid.js */
const path = require('node:path')
process.chdir(path.resolve(__dirname, '..'))
const mod = require(path.join(process.cwd(), 'app', 'lib', 'kugou-gcid.js'))

;(async () => {
  const gcid = 'gcid_3znx57dpz2tz0b7'   /* 用户给的那个 */
  console.log('测试 gcid: ' + gcid)
  const t0 = Date.now()
  try {
    const r = await mod.fetchGcidPlaylist(gcid, { maxSongs: 2000 })
    console.log('✓ 耗时 ' + (Date.now() - t0) + 'ms')
    console.log('  歌单名: ' + r.name)
    console.log('  总数: ' + r.total)
    console.log('  拿到: ' + r.songs.length + ' 首')
    console.log('  截断: ' + r.truncated)
    console.log('  封面: ' + String(r.cover).slice(0, 70))
    console.log('\n  前 5 首:')
    r.songs.slice(0, 5).forEach((s, i) => {
      console.log('    ' + (i + 1) + '. ' + s.name.slice(0, 34) + ' — ' + s.singer.slice(0, 18) + '  [' + s.durationText + ']')
      console.log('       hash=' + s.id.slice(0, 20) + '  cover=' + String(s.cover).slice(0, 50))
    })
    console.log('\n  最后 2 首:')
    r.songs.slice(-2).forEach((s) => {
      console.log('    ' + s.name.slice(0, 34) + ' — ' + s.singer.slice(0, 18))
    })
  } catch (e) {
    console.log('✗ 失败: ' + e.message)
    console.log(e.stack)
  }
})()
