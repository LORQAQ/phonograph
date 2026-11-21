'use strict'
/**
 * 第七轮 · C 批：前端剩余 P2/P3
 */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

const done = []
const miss = []

function edit (file, fn) {
  const lines = fs.readFileSync(file, 'utf8').split('\n')
  const before = lines.join('\n')
  fn(lines)
  const after = lines.join('\n')
  if (after !== before) { fs.writeFileSync(file, after, 'utf8'); return true }
  return false
}

const APP = 'public/app.js'

/* ---------- 1. remove 传 source ---------- */
edit(APP, (L) => {
  const i = L.findIndex((l) => l.includes("action: 'remove', listId, id: song.id"))
  if (i >= 0) {
    L[i] = L[i].replace("action: 'remove', listId, id: song.id",
      "action: 'remove', listId, id: song.id, source: song.source")
  }
}) ? done.push('remove 带 source') : miss.push('remove')

/* ---------- 2. 音量为 0 时取消静音是空操作 ---------- */
edit(APP, (L) => {
  const i = L.findIndex((l) => l.includes('function toggleMute ()'))
  if (i < 0) return
  /* 找到函数体结束 */
  let d = 0
  let j = i
  for (; j < L.length; j++) {
    for (const ch of L[j]) { if (ch === '{') d++; else if (ch === '}') d-- }
    if (j > i && d === 0) break
  }
  const body = [
    'function toggleMute () {',
    '  /* P3: 音量拖到 0 时 setVolume 会把 muted 置 true，此时再「取消静音」',
    '     只翻 muted 不动 volume → 仍然一点声音都没有，用户以为坏了。 */',
    '  const vol = Number(audio.volume) || 0',
    '  const muted = !!state.muted',
    '  if (muted || vol === 0) {',
    '    const target = vol > 0 ? vol : (state.volume > 0 ? state.volume : 0.8)',
    '    state.muted = false',
    '    audio.muted = false',
    '    setVolume(target)',
    '    toast(\'取消静音\', 1200)',
    '  } else {',
    '    state.muted = true',
    '    audio.muted = true',
    '    toast(\'已静音\', 1200)',
    '  }',
    '  const b = $(\'#btnMute\')',
    '  if (b) b.innerHTML = svg(state.muted ? \'i-mute\' : \'i-volume\')',
    '  saveSettings()',
    '}',
  ]
  L.splice(i, j - i + 1, ...body)
}) ? done.push('静音逻辑') : miss.push('toggleMute')

/* ---------- 3. state.settings 从未赋值 ---------- */
edit(APP, (L) => {
  const i = L.findIndex((l) => l.includes("state.dlFormat = s.dlFormat === 'flac' ? 'flac' : 'mp3'"))
  if (i < 0) return
  L.splice(i + 1, 0, '  state.settings = s    /* P3: 之前只摊平赋值，state.settings 永远是 null */')
}) ? done.push('state.settings 赋值') : miss.push('state.settings')

/* ---------- 4. format 参数只给下载用，别污染播放缓存 ---------- */
edit(APP, (L) => {
  const i = L.findIndex((l) => l.includes("if (typeof state.dlFormat === 'string') p.set('format', state.dlFormat)"))
  if (i < 0) return
  L[i] = '  /* P3: format 只有下载用得上，播放/测速不需要。' +
    '放进 songParams 会让播放缓存键被下载格式污染。 */'
}) ? done.push('songParams 去 format') : miss.push('format')

/* 下载处单独补 format */
edit(APP, (L) => {
  const i = L.findIndex((l) => l.includes("sp0.set('save', '1')"))
  if (i < 0) return
  L.splice(i + 1, 0, "    sp0.set('format', state.dlFormat)    /* 下载才带 format */")
}) ? done.push('下载补 format') : miss.push('下载 format')

/* ---------- 5. 播放缓存键去掉 dlFormat ---------- */
edit(APP, (L) => {
  const i = L.findIndex((l) => l.includes("const ck = song.source + '|' + song.id + '|' + (only || '') + '|' + state.quality + '|' + state.dlFormat"))
  if (i >= 0) {
    L[i] = "  /* P3: 去掉 dlFormat —— 在下载弹窗选一次 FLAC 不该让所有播放缓存失效 */\n" +
      "  const ck = song.source + '|' + song.id + '|' + (only || '') + '|' + state.quality"
  }
}) ? done.push('播放缓存键') : miss.push('缓存键')

/* ---------- 6. enhanceSelect 的 interval + document 监听 ---------- */
edit(APP, (L) => {
  const i = L.findIndex((l) => l.includes('setInterval(sync, 500)'))
  if (i < 0) return
  /* 替换 interval 为事件驱动 */
  L[i] = "  /* P3: 原来是 setInterval(sync, 500)，永不清理 —— boot 后常驻两个 interval。\n" +
    "     改成事件驱动：值变化时才同步（下拉点选时本来就手动调了 sync）。 */\n" +
    "  sel.addEventListener('change', sync)"
  /* document click 监听：改成模块级一次 */
  const j = L.findIndex((l, k) => k > i - 10 && k < i + 5 && l.includes("document.addEventListener('click', () => panel.classList.remove('show'))"))
  if (j >= 0) {
    L[j] = "  /* P3: 每个 select 都加一个 document 监听，7 个就 7 个。改成一个全局的。 */\n" +
      "  if (!window.__ddDocBound) {\n" +
      "    window.__ddDocBound = true\n" +
      "    document.addEventListener('click', () => document.querySelectorAll('.dd-panel.show').forEach((p) => p.classList.remove('show')))\n" +
      "  }"
  }
}) ? done.push('enhanceSelect 去轮询') : miss.push('enhanceSelect')

/* ---------- 7. 歌单加载失败只 console.warn ---------- */
edit(APP, (L) => {
  const i = L.findIndex((l) => l.includes("console.warn('[boot] loadPlaylists'"))
  if (i < 0) return
  L[i] = "    /* P3: 只 warn 的话用户会看到「没有歌单」，以为数据被清空了 */\n" +
    "    toast('歌单加载失败：' + ((e && e.message) || '网络异常') + '，可点右上角重试', 5000)"
}) ? done.push('歌单加载失败提示') : miss.push('loadPlaylists')

/* ---------- 8. 调试错误条只在 debug=1 时显示 ---------- */
edit(APP, (L) => {
  const i = L.findIndex((l) => l.includes('function toggleMute') || l.includes("window.__errs"))
  /* 直接在文件末尾追加：让错误条默认不显示（除非 ?debug=1） */
  if (!L.join('\n').includes('__errBarGuard')) {
    L.push(
      '',
      '/* P3: index.html 里的红色调试错误条对普通用户是噪音。',
      '   只在 URL 带 ?debug=1 时显示；正式使用只看 toast。 */',
      ';(function __errBarGuard () {',
      "  if (/[?&]debug=1/.test(location.search)) return",
      '  const hide = () => {',
      "    const b = document.getElementById('__errBar')",
      "    if (b) b.style.display = 'none'",
      '  }',
      '  hide()',
      '  setInterval(hide, 1000)',
      '})()',
      '')
    return true
  }
  return false
}) ? done.push('错误条默认隐藏') : miss.push('错误条')

/* ---------- 9. 取流并发合并（双击不重复请求） ---------- */
edit(APP, (L) => {
  const i = L.findIndex((l) => l.includes('async function streamSrc (song, only, forceFresh)'))
  if (i < 0) return
  let d = 0
  let j = i
  for (; j < L.length; j++) {
    for (const ch of L[j]) { if (ch === '{') d++; else if (ch === '}') d-- }
    if (j > i && d === 0) break
  }
  const body = [
    'const __srcInflight = new Map()',
    'async function streamSrc (song, only, forceFresh) {',
    '  /* P3: 缓存键去掉 dlFormat —— 在下载弹窗选一次 FLAC 不该让所有播放缓存失效 */',
    "  const ck = song.source + '|' + song.id + '|' + (only || '') + '|' + state.quality",
    '  const hit = __urlCache.get(ck)',
    '  if (!forceFresh && hit && hit.exp > Date.now()) return hit.url',
    '  /* P3: 双击同一首歌会并发两次取流，第一份结果被 playToken 丢掉、白跑一次音源探测 */',
    "  const ikey = ck + '|' + (forceFresh ? 'f' : '')",
    '  if (__srcInflight.has(ikey)) return __srcInflight.get(ikey)',
    '  const job = (async () => {',
    '    const url = await __streamSrcInner(song, only, forceFresh)',
    '    if (url) __urlCache.set(ck, { url, exp: Date.now() + URL_TTL })',
    '    return url',
    "  })().finally(() => __srcInflight.delete(ikey))",
    '  __srcInflight.set(ikey, job)',
    '  return job',
    '}',
  ]
  L.splice(i, j - i + 1, ...body)
}) ? done.push('取流并发合并') : miss.push('streamSrc')

console.log('=== C 批 ===')
done.forEach((d) => console.log('  ✓ ' + d))
if (miss.length) { console.log('未匹配:'); miss.forEach((m) => console.log('  ⚠ ' + m)) }