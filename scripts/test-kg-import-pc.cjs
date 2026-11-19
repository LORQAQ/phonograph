'use strict'
/* 实测两端酷狗歌单导入 */
process.chdir(require('node:path').resolve(__dirname, '..'))

const KG_URL = 'https://m.kugou.com/songlist/gcid_3znx57dpz2tz0b7/?src_cid=3znx57dpz2tz0b7'

;(async () => {
  console.log('=== 电脑端 importPlaylist ===')
  console.log('  链接: ' + KG_URL)
  try {
    const { importPlaylist } = require('./app/lib/playlist-import.js') || {}
    const mod = require('./app/lib/playlist-import.js')
    const fn = mod.importPlaylist || mod
    const t0 = Date.now()
    const r = await fn(KG_URL)
    console.log('  耗时: ' + (Date.now() - t0) + 'ms')
    console.log('  ✓ 歌单名: ' + r.name)
    console.log('  ✓ 数量: ' + (r.songs || []).length + ' 首')
    ;(r.songs || []).slice(0, 3).forEach((s, i) => {
      console.log('    ' + (i + 1) + '. ' + (s.name || '').slice(0, 30) + ' — ' + (s.singer || '').slice(0, 20))
      console.log('       hash=' + String(s.id).slice(0, 16) + ' cover=' + String(s.cover || '').slice(0, 50))
    })
  } catch (e) {
    console.log('  ✗ 失败: ' + e.message)
  }
})()
