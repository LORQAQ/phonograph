'use strict'
/* 修复第三轮审查发现的 5 个 P1 回归 + 几处 P2/P3 */
process.chdir(require('node:path').resolve(__dirname, '..'))
const fs = require('node:fs')
const p = 'public/app.js'
let s = fs.readFileSync(p, 'utf8')
const done = []
const miss = []

/* ============ P1-1: B69 TDZ（wrap 在声明前使用）============ */
{
  const old = `  sel.dataset.dd = '1'
  /* B69: 给包装器打标记，好让 CSS 能按 select 的 id 隐藏 */
  try { wrap.dataset.forSel = sel.id || '' } catch (e) { }
  const wrap = document.createElement('div')
  wrap.className = 'dd'`

  const neu = `  sel.dataset.dd = '1'
  const wrap = document.createElement('div')
  wrap.className = 'dd'
  /* B69: 给包装器打标记，让 CSS 能按 select 的 id 隐藏。
     注意必须放在 const wrap 之后 —— 放前面是 TDZ，会被 try/catch 静默吞掉。 */
  wrap.dataset.forSel = sel.id || ''`

  if (s.includes(old)) {
    s = s.replace(old, neu)
    done.push('P1-1 B69 TDZ 修正')
  } else {
    miss.push('B69')
  }
}

/* ============ P1-2: B87 renderNowPlaying(null) 直接 return ============ */
{
  const old = `function renderNowPlaying (song, resetBadge) {
  if (!song) return
  const cover = coverUrl(song)`

  const neu = `function renderNowPlaying (song, resetBadge) {
  if (!song) {
    /* B87: 清空队列时要真的把底栏清掉，不能直接 return */
    const elName = $('#npName'); if (elName) elName.textContent = '未在播放'
    const elSinger = $('#npSinger'); if (elSinger) elSinger.textContent = ''
    const elTitle = $('#npTitle'); if (elTitle) elTitle.textContent = ''
    const elArtist = $('#npArtist'); if (elArtist) elArtist.textContent = ''
    const elCover = $('#coverImg'); if (elCover) elCover.removeAttribute('src')
    const elNpCover = $('#npCover'); if (elNpCover) elNpCover.removeAttribute('src')
    const elLyricCover = $('#lyricCover'); if (elLyricCover) elLyricCover.removeAttribute('src')
    const elBg = $('#lyricBg'); if (elBg) elBg.style.backgroundImage = ''
    $$('.song-list tbody tr').forEach((tr) => tr.classList.remove('playing'))
    if (resetBadge) { try { setSrc('') } catch (e) { } }
    try { paintProgress(0) } catch (e) { }
    const elTotal = $('#totalTime'); if (elTotal) elTotal.textContent = '00:00'
    return
  }
  const cover = coverUrl(song)`

  if (s.includes(old)) {
    s = s.replace(old, neu)
    done.push('P1-2 B87 renderNowPlaying(null) 真正清空')
  } else {
    miss.push('B87 renderNowPlaying')
  }
}

/* ============ P1-3: B63 r0 跨块作用域 ============ */
{
  const old = `    try {
      const r0 = await api('/api/download?'`
  if (s.includes(old)) {
    /* 改成 let r0 = null 在外层 */
    s = s.replace(old, `    let r0 = null
    try {
      r0 = await api('/api/download?'`)
    done.push('P1-3 B63 r0 提到外层')
  } else {
    const i = s.indexOf("api('/api/download?'")
    if (i > 0) console.log('  B63 现场:\n' + s.slice(Math.max(0, i - 400), i + 300))
    else miss.push('B63')
  }
}

/* ============ P1-4: B66 搜索加请求序号 ============ */
{
  if (!s.includes('searchSeq')) {
    const anchor = 'async function doSearch (append'
    if (s.includes(anchor)) {
      s = s.replace(anchor, `/* P1-4: 去掉 loading 早退后必须用序号丢弃过期响应 */
let searchSeq = 0
async function doSearch (append`)
      done.push('P1-4 B66 声明 searchSeq')
    } else {
      miss.push('B66 doSearch 定义')
    }
  }

  /* 在 doSearch 里加 seq 与丢弃 */
  const bodyOld = `  state.keyword = kw`
  if (s.includes(bodyOld) && !s.includes('const seq = ++searchSeq')) {
    s = s.replace(bodyOld, `  const seq = ++searchSeq
  state.keyword = kw`)
    done.push('P1-4 B66 记录 seq')
  }

  /* 在 renderSearchResults 前加丢弃 */
  const rOld = `  state.results = append ? state.results.concat(data.list || []) : (data.list || [])`
  if (s.includes(rOld) && !s.includes('if (seq !== searchSeq) return')) {
    s = s.replace(rOld, `  /* 迟到的响应直接丢弃，避免两次搜索互相覆盖 */
  if (seq !== searchSeq) return
  state.results = append ? state.results.concat(data.list || []) : (data.list || [])`)
    done.push('P1-4 B66 丢弃过期响应')
  }
}

/* ============ P1-5: B55 forceFresh 没有调用点 ============ */
{
  const old = `const next = await streamSrc(state.currentSong)`
  const cnt = (s.match(/const next = await streamSrc\(state\.currentSong\)/g) || []).length
  if (cnt > 0) {
    s = s.split('const next = await streamSrc(state.currentSong)').join("const next = await streamSrc(state.currentSong, '', true)")
    done.push('P1-5 B55 forceFresh 传 true（' + cnt + ' 处）')
  } else {
    miss.push('B55 调用点')
  }
}

fs.writeFileSync(p, s, 'utf8')
console.log('=== 已完成 ===')
done.forEach((d) => console.log('  ✓ ' + d))
if (miss.length) {
  console.log('=== 未匹配 ===')
  miss.forEach((m) => console.log('  ⚠ ' + m))
}
