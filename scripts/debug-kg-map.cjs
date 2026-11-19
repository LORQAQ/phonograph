'use strict'
/* 精确调试：打印原始 duration 与转换结果 */
const path = require('node:path')
process.chdir(path.resolve(__dirname, '..'))
const mod = require(path.join(process.cwd(), 'app', 'lib', 'kugou-gcid.js'))

;(async () => {
  const gcid = 'gcid_3znx57dpz2tz0b7'
  const { globalId } = await mod.decodeGcid(gcid)
  console.log('globalId: ' + globalId)

  /* 直接用 getSongPage 拿原始数据 */
  try {
    const r = await mod.getSongPage(globalId, 1, 3)
    console.log('\ngetSongPage 成功，total=' + r.total + ' list=' + r.list.length)
    if (r.list[0]) {
      console.log('\n原始 x.duration = ' + JSON.stringify(r.list[0].duration))
      console.log('原始 x.filename = ' + JSON.stringify(r.list[0].filename))
      console.log('原始 x.remark = ' + JSON.stringify(r.list[0].remark))
      console.log('原始 x.songname = ' + JSON.stringify(r.list[0].songname))
      console.log('原始 x.singername = ' + JSON.stringify(r.list[0].singername))

      const mapped = mod.mapKgSong(r.list[0])
      console.log('\n映射结果:')
      console.log('  name = ' + mapped.name)
      console.log('  singer = ' + mapped.singer)
      console.log('  duration = ' + mapped.duration)
      console.log('  durationText = ' + mapped.durationText)
    }
  } catch (e) {
    console.log('getSongPage 失败: ' + e.message)
    console.log('改用 getSongPageAlt')
    const r2 = await mod.getSongPageAlt(globalId, 1, 3)
    if (r2.list[0]) {
      console.log('  duration = ' + JSON.stringify(r2.list[0].duration))
      console.log('  filename = ' + JSON.stringify(r2.list[0].filename))
      const m2 = mod.mapKgSong(r2.list[0])
      console.log('  → name=' + m2.name + ' singer=' + m2.singer + ' durText=' + m2.durationText)
    }
  }
})()
