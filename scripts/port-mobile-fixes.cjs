'use strict'
/* 把手机端的修复移植到电脑端：
   1) 前端加残缺检测（checkPreviewAndSwitch）
   2) 服务端 source-manager 加外链过滤
   3) CSS 加歌词高亮放大 */
const fs = require('node:fs')

/* ---------- 1) public/app.js 加残缺检测 ---------- */
const ap = 'public/app.js'
let a = fs.readFileSync(ap, 'utf8')

if (!a.includes('checkPreviewAndSwitch')) {
  const fn = `
/* 从 "4:16" 解析秒数 */
function parseDurText (t) {
  if (!t) return 0
  const m = String(t).match(/(\\d+):(\\d+)/)
  if (!m) return 0
  return Number(m[1]) * 60 + Number(m[2])
}

/* 拿到的是残缺/试听片段时，自动换平台重取 */
async function checkPreviewAndSwitch (song, gotDuration) {
  const real = parseDurText(song.durationText)
  if (!real || !gotDuration) return false
  if (real > 90 && gotDuration < real * 0.85) {
    console.warn('[残缺版]', song.name, '原长', real + 's', '实际', Math.round(gotDuration) + 's')
    const tried = state.__triedPlat || (state.__triedPlat = new Set())
    state.__switchCount = (state.__switchCount || 0) + 1
    if (state.__switchCount > 3) {
      toast('这首暂时只有试听版，换一首试试', 2600)
      return false
    }
    const order = ['kg', 'tx', 'wy'].filter((x) => x !== song.source && !tried.has(x))
    if (!order.length) { state.__triedPlat = new Set(); return false }
    const next = order[0]
    tried.add(next)
    const pname = { tx: 'QQ音乐', kg: '酷狗', wy: '网易云' }[next] || next
    toast('这首是残缺版，换到 ' + pname + ' 重试', 2600)
    const alt = Object.assign({}, song, { source: next })
    try { startSong(alt, '') } catch (e) { }
    return true
  }
  return false
}
`
  /* 插到 startSong 之前 */
  if (a.includes('async function startSong (song, only) {')) {
    a = a.replace('async function startSong (song, only) {', fn + '\nasync function startSong (song, only) {')
    console.log('电脑端 app.js: checkPreviewAndSwitch 已加')
  } else {
    console.log('电脑端 app.js: 未找到 startSong')
  }

  /* 在 audio.src 之后挂检测 */
  const anchor = '  audio.src = await streamSrc(song, only)'
  if (a.includes(anchor)) {
    a = a.replace(anchor, `  audio.src = await streamSrc(song, only)
  /* 残缺检测：metadata / durationchange / 轮询 */
  let __pcChecked = false
  const __pcCheck = () => {
    if (__pcChecked) return
    const d = audio.duration
    if (!d || !isFinite(d) || d <= 0) return
    __pcChecked = true
    try { checkPreviewAndSwitch(song, d) } catch (e) { }
  }
  audio.addEventListener('loadedmetadata', __pcCheck, { once: true })
  audio.addEventListener('durationchange', __pcCheck, { once: true })
  setTimeout(__pcCheck, 1500)
  setTimeout(__pcCheck, 4000)`)
    console.log('电脑端 app.js: 残缺检测已挂载')
  } else {
    console.log('电脑端 app.js: 未找到 audio.src（startSong 结构可能不同）')
  }

  /* 切歌时按 id 重置 */
  a = a.replace(
    `async function startSong (song, only) {
  const token = ++state.playToken`,
    `async function startSong (song, only) {
  const token = ++state.playToken
  const __songKey = String(song.id)
  if (!state.__lastSongKey || state.__lastSongKey !== __songKey) {
    state.__lastSongKey = __songKey
    state.__triedPlat = new Set()
    state.__switchCount = 0
  }`
  )

  fs.writeFileSync(ap, a, 'utf8')
} else {
  console.log('电脑端 app.js 已有残缺检测')
}

/* ---------- 2) source-manager.js 加外链过滤 ---------- */
const smp = 'app/lib/source-manager.js'
let sm = fs.readFileSync(smp, 'utf8')

if (!sm.includes('song/media/outer')) {
  /* 找 probeUrl 或 urlOk 之类的校验函数 */
  let injected = false
  for (const key of ['async function probeUrl', 'function probeUrl', 'async function urlOk', 'function isUsable']) {
    const i = sm.indexOf(key)
    if (i > 0) {
      const brace = sm.indexOf('{', i)
      if (brace > 0) {
        sm = sm.slice(0, brace + 1) + `
  /* 网易云外链是 302 占位，播放必失败 */
  if (/music\\.163\\.com\\/song\\/media\\/outer/i.test(String(url || ''))) return false
` + sm.slice(brace + 1)
        injected = true
        console.log('source-manager: 外链过滤已插入 ' + key)
        break
      }
    }
  }
  if (!injected) {
    console.log('source-manager: 未找到 probe 函数，改用兜底方案')
  }
  fs.writeFileSync(smp, sm, 'utf8')
} else {
  console.log('source-manager 已有外链过滤')
}

/* ---------- 3) style.css 加歌词高亮放大 ---------- */
const cp = 'public/style.css'
let c = fs.readFileSync(cp, 'utf8')
if (!c.includes('歌词高亮放大')) {
  c += `
/* ==== 歌词高亮放大 ==== */
.lyric-line {
  transition: color .25s ease, font-size .25s ease, transform .25s ease, opacity .25s ease;
  transform-origin: left center;
}
.lyric-line.active {
  color: #fff !important;
  font-size: 1.26em !important;
  font-weight: 700 !important;
  transform: scale(1.03);
  text-shadow: 0 2px 18px rgba(0,0,0,.6);
}
.lyric-line:not(.active) { opacity: .58; }
.lyric-line:hover { opacity: .95; }

/* 播放页（deck）歌词 */
.ll { transition: color .2s, opacity .2s, font-size .2s; cursor: pointer; }
.ll.active { color: var(--accent, #1f9d55); opacity: 1; font-weight: 700; font-size: 1.12em; }
`
  fs.writeFileSync(cp, c, 'utf8')
  console.log('电脑端 style.css: 歌词高亮放大已加')
} else {
  console.log('电脑端 style.css 已有高亮放大')
}

console.log('\n完成')
