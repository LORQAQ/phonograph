'use strict'
/* 第四轮自检：多歌单实测 + 关键路径验证 */
const path = require('node:path')
const http = require('node:http')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

const mod = require(path.join(process.cwd(), 'app', 'lib', 'kugou-gcid.js'))

/* 多个 gcid 测试（含之前验证过的大歌单） */
const GCIDS = [
  { id: 'gcid_3znx57dpz2tz0b7', note: '用户给的《1111》，45 首' },
  { id: 'gcid_3z15afruoz7z035', note: '《孙楠全部歌曲》，553 首' },
]

;(async () => {
  console.log('=== 1. 多歌单 gcid 实测 ===')
  for (const g of GCIDS) {
    const t0 = Date.now()
    try {
      const r = await mod.fetchGcidPlaylist(g.id, { maxSongs: 3000 })
      const ms = Date.now() - t0
      console.log('  ✓ ' + g.note)
      console.log('    ' + r.name + '  total=' + r.total + '  拿到=' + r.songs.length + '  截断=' + r.truncated + '  ' + ms + 'ms')
      /* 字段完整性抽查 */
      const s0 = r.songs[0]
      const bad = []
      if (!s0.name || s0.name === '未知歌曲') bad.push('name')
      if (!s0.singer || s0.singer === '未知歌手') bad.push('singer')
      if (!s0.duration || s0.duration < 10000) bad.push('duration')
      if (!s0.durationText || s0.durationText.startsWith('0:')) bad.push('durationText')
      if (!s0.cover) bad.push('cover')
      if (!s0.id) bad.push('id')
      console.log('    字段检查: ' + (bad.length ? '✗ 缺 ' + bad.join(',') : '✓ 全齐'))
      console.log('    样本: ' + s0.name.slice(0, 26) + ' — ' + s0.singer.slice(0, 16) + ' [' + s0.durationText + ']')
      /* 去重检查 */
      const uniq = new Set(r.songs.map((x) => x.id)).size
      console.log('    去重: ' + uniq + '/' + r.songs.length + (uniq === r.songs.length ? ' ✓' : ' ✗ 有重复'))
    } catch (e) {
      console.log('  ✗ ' + g.note + ': ' + e.message)
    }
  }

  console.log('\n=== 2. 并发导入同一歌单（in-flight 检查）===')
  const t1 = Date.now()
  const rs = await Promise.all([
    mod.fetchGcidPlaylist(GCIDS[0].id, { maxSongs: 500 }).catch((e) => ({ err: e.message })),
    mod.fetchGcidPlaylist(GCIDS[0].id, { maxSongs: 500 }).catch((e) => ({ err: e.message })),
  ])
  const ok = rs.filter((x) => x.songs).length
  console.log('  2 并发: ' + ok + '/2 成功，耗时 ' + (Date.now() - t1) + 'ms')
  console.log('  （没有 in-flight 合并 → 会打两遍酷狗接口）')

  console.log('\n=== 3. 无效 gcid ===')
  try {
    await mod.fetchGcidPlaylist('gcid_invalid_notexist123', { maxSongs: 10 })
    console.log('  ✗ 应该抛错但没抛')
  } catch (e) {
    console.log('  ✓ 正确抛错: ' + e.message.slice(0, 60))
  }

  console.log('\n=== 4. 前端函数存在性 ===')
  const app = fs.readFileSync('public/app.js', 'utf8')
  const need = ['paintProgress', 'setSrc', 'updatePlayButton', 'renderDownloadsView', 'saveQueue', 'renderQueue']
  for (const f of need) {
    const has = new RegExp('function\\s+' + f + '\\s*\\(').test(app) || new RegExp('const\\s+' + f + '\\s*=').test(app)
    console.log('  ' + (has ? '✓' : '✗') + ' ' + f)
  }

  console.log('\n=== 5. state.lastGoodQuality 初始化 ===')
  const initIdx = app.indexOf('lastGoodQuality')
  if (initIdx < 0) console.log('  ✗ 全文件没有 lastGoodQuality')
  else {
    const lines = app.split('\n')
    lines.forEach((l, i) => {
      if (l.includes('lastGoodQuality')) console.log('  L' + (i + 1) + ': ' + l.trim().slice(0, 90))
    })
  }

  console.log('\n=== 6. 残留引用扫描 ===')
  const dead = ['renderList', 'prevAudioQuality', 'hit.value']
  for (const d of dead) {
    const cnt = (app.match(new RegExp(d.replace('.', '\\.'), 'g')) || []).length
    console.log('  ' + d + ': ' + cnt + ' 处' + (cnt === 0 ? ' ✓' : ''))
  }
})()
