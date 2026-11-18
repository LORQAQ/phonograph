'use strict'
/* VIP 歌取到的是 30 秒试听版 → 播放一下就没声了，用户看到"播放失败"
   方案：加载后对比原曲时长，发现是试听版就自动换平台重取 */
const fs = require('node:fs')
const p = 'mobile/www/app.js'
let a = fs.readFileSync(p, 'utf8')

if (a.includes('__previewCheck')) {
  console.log('已存在')
  process.exit(0)
}

/* 1) 加辅助函数 */
const fn = `
/* 从 "4:16" 解析秒数 */
function parseDurText (t) {
  if (!t) return 0
  const m = String(t).match(/(\\d+):(\\d+)/)
  if (!m) return 0
  return Number(m[1]) * 60 + Number(m[2])
}

/* 检测是否拿到试听片段；是的话换平台重取 */
let __previewCheck = 0
async function checkPreviewAndSwitch (song, gotDuration) {
  const real = parseDurText(song.durationText)
  if (!real || !gotDuration) return false
  /* 原曲明显长于拿到的片段，且片段很短 → 试听版 */
  if (real > 100 && gotDuration < Math.min(65, real * 0.6)) {
    console.warn('[试听版]', song.name, '原长', real + 's', '实际', Math.round(gotDuration) + 's')
    const tried = state.__triedPlat || (state.__triedPlat = new Set())
    const order = ['tx', 'kg', 'wy'].filter((x) => x !== song.source && !tried.has(x))
    if (!order.length) { state.__triedPlat = new Set(); return false }
    const next = order[0]
    tried.add(next)
    toast('这首是试听版，换到 ' + ({ tx: 'QQ音乐', kg: '酷狗', wy: '网易云' }[next]) + ' 重试', 2800)
    const alt = Object.assign({}, song, { source: next })
    try { startSong(alt, '') } catch (e) { }
    return true
  }
  return false
}
`
a = a.replace('async function startSong (song, only) {', fn + '\nasync function startSong (song, only) {')

/* 2) startSong 里挂了 loadedmetadata 检查 */
const anchor = '    audio.src = url\n    audio.play().catch(() => { })'
if (a.includes(anchor)) {
  a = a.replace(anchor, `    audio.src = url
    /* 试听版检测：拿到元数据后核对时长 */
    audio.onloadedmetadata = function () {
      try { checkPreviewAndSwitch(song, audio.duration) } catch (e) { }
    }
    audio.play().catch(() => { })`)
  console.log('试听检测已接入')
} else {
  console.log('未匹配 audio.src 插入点')
}

/* 3) 切歌时清掉已试平台记录 */
a = a.replace(
  'async function startSong (song, only) {\n  const token = ++state.playToken',
  'async function startSong (song, only) {\n  const token = ++state.playToken\n  /* 同一首首次播放才清空"已试平台" */\n  if (!state.__lastSongKey || state.__lastSongKey !== (song.source + song.id)) {\n    state.__lastSongKey = song.source + song.id\n    state.__triedPlat = new Set()\n  }'
)

fs.writeFileSync(p, a, 'utf8')
console.log('完成')
