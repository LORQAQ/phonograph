'use strict'
/* 取流加速：
   1) 单音源超时 9s -> 5s（慢的就别等了）
   2) 总超时 20s -> 8s
   3) 自动预取下一首（听完这首时下一首已缓存） */
const fs = require('node:fs')

/* ---------- 引擎：缩短超时 ---------- */
const ep = 'mobile/www/lib/lx-engine-web.js'
let e = fs.readFileSync(ep, 'utf8')
e = e.replace(
  "const r = await withTimeout(Promise.resolve(s2.musicUrl(platform, info, quality)), 9000)",
  "const r = await withTimeout(Promise.resolve(s2.musicUrl(platform, info, quality)), 5000)"
)
e = e.replace(
  "setTimeout(() => { if (!done) { done = true; resolve(null) } }, 20000)",
  "setTimeout(() => { if (!done) { done = true; resolve(null) } }, 8000)"
)
fs.writeFileSync(ep, e, 'utf8')
console.log('引擎超时已缩短（单源 5s / 总 8s）')

/* ---------- app.js：预取下一首 ---------- */
const ap = 'mobile/www/app.js'
let a = fs.readFileSync(ap, 'utf8')

if (!a.includes('prefetchNext')) {
  const fn = `
/* 预取下一首的播放地址（后台进行，不阻塞） */
let __prefetching = false
async function prefetchNext () {
  if (__prefetching) return
  if (!state.queue || state.queue.length < 2) return
  const next = state.queue[(state.index + 1) % state.queue.length]
  if (!next) return
  const ck = next.source + '|' + next.id + '||' + state.quality + '|' + state.dlFormat
  if (__urlCache.has(ck)) return
  __prefetching = true
  try {
    const url = await __streamSrcInner(next)
    if (url) __urlCache.set(ck, { url, exp: Date.now() + URL_TTL })
  } catch (e) { }
  __prefetching = false
}
`
  a = a.replace('async function startSong (song, only) {', fn + '\nasync function startSong (song, only) {')
  console.log('prefetchNext 已加')
}

/* 播放开始后触发预取 */
if (!a.includes('setTimeout(prefetchNext')) {
  a = a.replace(
    "    /* 来源提示用缓存里的（避免再发一次请求） */",
    "    /* 后台预取下一首 */\n    setTimeout(() => { try { prefetchNext() } catch (e) { } }, 3000)\n    /* 来源提示用缓存里的（避免再发一次请求） */"
  )
  console.log('预取触发已接入')
}

fs.writeFileSync(ap, a, 'utf8')
console.log('完成')
