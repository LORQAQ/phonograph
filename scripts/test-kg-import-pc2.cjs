'use strict'
/* 实测两端酷狗歌单导入（用绝对路径 require） */
const path = require('node:path')
process.chdir(path.resolve(__dirname, '..'))
const ROOT = process.cwd()

const KG_URL = 'https://m.kugou.com/songlist/gcid_3znx57dpz2tz0b7/?src_cid=3znx57dpz2tz0b7'

;(async () => {
  console.log('项目根: ' + ROOT)
  console.log('=== 电脑端 app/lib/playlist-import.js ===')
  console.log('  链接: ' + KG_URL)
  try {
    const mod = require(path.join(ROOT, 'app', 'lib', 'playlist-import.js'))
    const fn = mod.importPlaylist || mod
    const t0 = Date.now()
    const r = await fn(KG_URL)
    console.log('  耗时: ' + (Date.now() - t0) + 'ms')
    console.log('  ✓ 歌单名: ' + r.name)
    console.log('  ✓ 数量: ' + (r.songs || []).length + ' 首')
    ;(r.songs || []).slice(0, 3).forEach((s, i) => {
      console.log('    ' + (i + 1) + '. ' + String(s.name || '').slice(0, 30) + ' — ' + String(s.singer || '').slice(0, 20))
      console.log('       hash=' + String(s.id).slice(0, 16) + '  cover=' + String(s.cover || '').slice(0, 45))
    })
  } catch (e) {
    console.log('  ✗ 失败: ' + e.message)
  }
})()
