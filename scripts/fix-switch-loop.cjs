'use strict'
/* 切换平台时 song.source 变了，导致 __lastSongKey 变化 → triedPlat 被清空 → 无限循环
   改成只用 song.id 判断，并限制最大切换次数 */
const fs = require('node:fs')
const p = 'mobile/www/app.js'
let a = fs.readFileSync(p, 'utf8')

/* 1) 用 id 作为 key */
a = a.replace(
  `  /* 同一首首次播放才清空"已试平台" */
  if (!state.__lastSongKey || state.__lastSongKey !== (song.source + song.id)) {
    state.__lastSongKey = song.source + song.id
    state.__triedPlat = new Set()
  }`,
  `  /* 同一首（按 id 判断，切换平台后 source 会变）首次播放才清空已试记录 */
  const songKey = String(song.id)
  if (!state.__lastSongKey || state.__lastSongKey !== songKey) {
    state.__lastSongKey = songKey
    state.__triedPlat = new Set()
    state.__switchCount = 0
  }`
)

/* 2) 切换加次数上限 */
a = a.replace(
  `    const tried = state.__triedPlat || (state.__triedPlat = new Set())
    const order = ['tx', 'kg', 'wy'].filter((x) => x !== song.source && !tried.has(x))
    if (!order.length) { state.__triedPlat = new Set(); return false }`,
  `    const tried = state.__triedPlat || (state.__triedPlat = new Set())
    state.__switchCount = (state.__switchCount || 0) + 1
    if (state.__switchCount > 3) {
      console.warn('[试听版] 已切换 3 次仍未拿到完整版，停止尝试')
      toast('这首暂时只有试听版，换一首试试', 2600)
      return false
    }
    const order = ['kg', 'tx', 'wy'].filter((x) => x !== song.source && !tried.has(x))
    if (!order.length) { state.__triedPlat = new Set(); return false }`
)

fs.writeFileSync(p, a, 'utf8')
console.log('切换逻辑已修复：按 id 判定 + 最多 3 次 + kg 优先')
