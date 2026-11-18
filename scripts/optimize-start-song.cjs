'use strict'
/* 换歌优化：
   1) 立即暂停旧音频（避免残留声音）
   2) 取流 + 歌词并行（原来是串行，一共等两次网络）
   3) 去掉重复的 /api/url 调用（原来取流两次）
   4) 切歌后旧请求回来直接丢弃（token 校验） */
const fs = require('node:fs')
const p = 'mobile/www/app.js'
let a = fs.readFileSync(p, 'utf8')

const startMark = 'async function startSong (song, only) {'
const start = a.indexOf(startMark)
if (start < 0) { console.log('未找到 startSong'); process.exit(1) }

/* 找函数结束 */
let depth = 0
let started = false
let end = start
for (let i = start; i < a.length; i++) {
  if (a[i] === '{') { depth++; started = true } else if (a[i] === '}') { depth--; if (started && depth === 0) { end = i + 1; break } }
}

const impl = `async function startSong (song, only) {
  const token = ++state.playToken

  /* ① 立即掐掉上一首，避免新旧音频混在一起 */
  try {
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
  } catch (e) { }

  state.currentSong = song
  state.pendingSeek = 0

  /* ② 先把界面切到新歌（瞬时反馈，不等网络） */
  renderNowPlaying(song, true)
  try { pickThemeFromCover(song) } catch (e) { }
  state.lyrics = []
  state.lyricIndex = -1
  state.lrcOffset = 0
  try { updateOffsetTip() } catch (e) { }
  const li = $('#lyricInner')
  const lr = $('#lyricRoll')
  if (li) li.innerHTML = '<p class="lyric-empty">歌词加载中…</p>'
  if (lr) lr.innerHTML = '<p class="lyric-empty">歌词加载中…</p>'
  setSrc('正在解析…')

  /* ③ 取流 + 歌词并行，只等一次往返 */
  const lyricQ = '/api/lyric?source=' + (song.source || 'wy') + '&id=' + encodeURIComponent(song.id) + '&interval=' + encodeURIComponent(song.durationText || '')
  const [urlRes, lyricRes] = await Promise.allSettled([
    streamSrc(song, only),
    api(lyricQ),
  ])

  /* ④ 已经切到别的歌了，这轮结果作废 */
  if (token !== state.playToken) return

  const url = urlRes.status === 'fulfilled' ? urlRes.value : ''
  if (url) {
    audio.src = url
    audio.play().catch(() => { })
    /* 来源提示用缓存里的（避免再发一次请求） */
    const ck = cacheKey(song) + (only || '')
    const cached = state.urlCache && state.urlCache.get(ck)
    if (cached) setSrc(cached.provider + ' · ' + cached.quality)
    else setSrc('已就绪')
  } else {
    setSrc('解析失败')
    toast('这首取不到播放地址，换一首试试', 3200)
  }

  /* ⑤ 歌词 */
  if (lyricRes.status === 'fulfilled' && lyricRes.value) {
    const ly = lyricRes.value
    state.lyrics = parseLrc(ly.lyric, ly.tlyric)
    renderLyric(); renderPanelLyric()
    try { broadcast() } catch (e) { }
  } else {
    if (li) li.innerHTML = '<p class="lyric-empty">暂无歌词</p>'
    if (lr) lr.innerHTML = '<p class="lyric-empty">暂无歌词</p>'
  }

  /* ⑥ 收尾（不 await，避免拖慢） */
  try { addRecent(song) } catch (e) { }
  try { renderQueue() } catch (e) { }
  try { saveQueue() } catch (e) { }
}`

a = a.slice(0, start) + impl + a.slice(end)
fs.writeFileSync(p, a, 'utf8')
console.log('startSong 已重写：立即停旧 + 并行取流歌词 + 去重复请求')
