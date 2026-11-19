'use strict'
/* 修第三轮审查剩下的 P2/P3 */
process.chdir(require('node:path').resolve(__dirname, '..'))
const fs = require('node:fs')
const p = 'public/app.js'
let s = fs.readFileSync(p, 'utf8')
const done = []
const miss = []

/* ============ P1-6: B2 音质回退（prevQuality === wanted）============ */
{
  /* 1) onchange 传旧音质 */
  const oldOnChange = `$('#qualitySelect').onchange = (e) => {
    state.quality = e.target.value`
  if (s.includes(oldOnChange)) {
    s = s.replace(oldOnChange, `$('#qualitySelect').onchange = (e) => {
    const __prevQ = state.quality          /* P1-6: 先存旧音质 */
    state.quality = e.target.value`)
    /* 找后面的 reloadCurrent() */
    const idx = s.indexOf('const __prevQ = state.quality')
    const seg = s.slice(idx, idx + 600)
    if (seg.includes('reloadCurrent()')) {
      s = s.slice(0, idx) + seg.replace('reloadCurrent()', 'saveSettings(); reloadCurrent(__prevQ)') + s.slice(idx + 600)
      done.push('P1-6 B2 onchange 传旧音质')
    }
  } else {
    miss.push('B2 onchange')
  }

  /* 2) reloadCurrent 接收参数 */
  if (s.includes('async function reloadCurrent ()') && !s.includes('async function reloadCurrent (prevQualityArg)')) {
    s = s.replace('async function reloadCurrent ()', 'async function reloadCurrent (prevQualityArg)')
    s = s.replace(`  const prevQuality = state.quality
  const wanted = state.quality`,
      `  /* P1-6: 旧音质从调用点传进来（onchange 已经先改了 state.quality） */
  const prevQuality = prevQualityArg || state.lastGoodQuality || state.quality
  const wanted = state.quality`)
    done.push('P1-6 B2 reloadCurrent 接参数')
  }

  /* 3) onOk 成功后记 lastGoodQuality */
  const okOld = `    settled = true
    if (timer) { clearTimeout(timer); timer = null }
    cleanup()
    audio.currentTime = t`
  if (s.includes(okOld)) {
    s = s.replace(okOld, `    settled = true
    if (timer) { clearTimeout(timer); timer = null }
    cleanup()
    state.lastGoodQuality = state.quality     /* P1-6: 记住这次成功的音质 */
    audio.currentTime = t`)
    done.push('P1-6 B2 记录 lastGoodQuality')
  }
}

/* ============ P2-1: B8 boot 分段 try/catch（之前只加了 .catch）============ */
{
  const old = `  await loadPlaylists()
  await loadSources()`
  if (s.includes(old)) {
    s = s.replace(old, `  /* P2-1: 单个接口失败不能让整页变「初始化失败」 */
  try { await loadPlaylists() } catch (e) { console.warn('[boot] loadPlaylists', e && e.message) }
  try { await loadSources() } catch (e) { console.warn('[boot] loadSources', e && e.message) }`)
    done.push('P2-1 B8 boot 分段 try/catch')
  } else {
    miss.push('B8 boot await')
  }
}

/* ============ P3-1: B53 cleanup 提前到开头 ============ */
{
  const old = `  const __srcUrl = await streamSrc(song, only)`
  if (s.includes(old) && !s.includes('/* P3-1: 进来先回收上一首')) {
    /* 在 token 之后插入 */
    const tokenLine = 'const token = ++state.playToken'
    if (s.includes(tokenLine)) {
      s = s.replace(tokenLine, `${tokenLine}
  /* P3-1: 进来先回收上一首的探测器，别等取流成功（失败路径会跳过回收） */
  if (state.__pcCleanup) { try { state.__pcCleanup() } catch (e) { } state.__pcCleanup = null }`)
      done.push('P3-1 B53 cleanup 提前')
    }
  }

  /* 删掉原来的回收（避免双重） */
  const dupOld = `  if (state.__pcCleanup) { try { state.__pcCleanup() } catch (e) { } state.__pcCleanup = null }
  let __pcChecked = false`
  const cnt = (s.match(/if \(state\.__pcCleanup\)/g) || []).length
  if (cnt > 1) {
    /* 保留第一个（开头的），删掉第二个 */
    const first = s.indexOf('if (state.__pcCleanup)')
    const second = s.indexOf('if (state.__pcCleanup)', first + 10)
    if (second > 0) {
      const ls = s.lastIndexOf('\n', second - 1) + 1
      const le = s.indexOf('\n', second)
      s = s.slice(0, ls) + s.slice(le + 1)
      done.push('P3-1 删除重复 cleanup')
    }
  }
}

/* ============ P2-2: B52 取流失败复位播放态 ============ */
{
  const old = `  if (!__srcUrl) {
    audio.removeAttribute('src')
    setSrc('解析失败')
    state.failCount = (state.failCount || 0) + 1`
  if (s.includes(old)) {
    s = s.replace(old, `  if (!__srcUrl) {
    /* P2-2: 取流失败要把播放态复位，否则按钮还是「暂停」图标、黑胶还在转 */
    try { audio.pause() } catch (e) { }
    audio.removeAttribute('src')
    try { audio.load() } catch (e) { }
    state.playing = false
    try { updatePlayButton() } catch (e) { }
    try { const v = $('#vinyl'); if (v) v.classList.remove('playing') } catch (e) { }
    try { const tn = $('#tonearm'); if (tn) tn.classList.remove('on') } catch (e) { }
    setSrc('解析失败')
    state.failCount = (state.failCount || 0) + 1`)
    done.push('P2-2 B52 复位播放态')
  } else {
    miss.push('B52 取流失败分支')
  }

  /* 取流成功时清跳过计数 */
  const okSrc = `  audio.src = __srcUrl`
  if (s.includes(okSrc)) {
    s = s.replace(okSrc, `  state.failCount = 0    /* P2-2: 成功就清零，别和 onAudioError 的计数串 */
  audio.src = __srcUrl`)
    done.push('P2-2 成功清零 failCount')
  }
}

/* ============ P3-2: B86 第二处 renderList ============ */
{
  const old = `setTimeout(() => { state.downloading.delete(key); try { renderList && renderList() } catch (e) {} }, 3000)`
  if (s.includes(old)) {
    s = s.replace(old, `setTimeout(() => {
      state.downloading.delete(key)
      try { if (state.view === 'downloads') renderDownloadsView() } catch (e) { }
    }, 3000)`)
    done.push('P3-2 B86 第二处 renderList')
  } else {
    miss.push('B86 第二处')
  }
}

/* ============ P3-3: navGo 加 downloads 分支 ============ */
{
  const old = `    else if (e.view === 'recent') renderRecentView()`
  if (s.includes(old) && !s.includes("e.view === 'downloads'")) {
    s = s.replace(old, `${old}
    else if (e.view === 'downloads') renderDownloadsView()`)
    done.push('P3-3 navGo downloads 分支')
  }
}

/* ============ P2-3: 设置面板的下载格式按钮绑定 ============ */
{
  const anchor = `    bindWebviewMessage()`
  if (s.includes(anchor) && !s.includes('/* P2-3: 下载格式按钮')) {
    s = s.replace(anchor, `    bindWebviewMessage()
    /* P2-3: 下载格式按钮之前只在 renderDownloadsView 里绑定，
       不进下载页就点不动 */
    $$('.dl-fmt').forEach((b) => {
      b.classList.toggle('active', b.dataset.fmt === state.dlFormat)
      b.onclick = () => {
        state.dlFormat = b.dataset.fmt
        saveSettings()
        $$('.dl-fmt').forEach((x) => x.classList.toggle('active', x.dataset.fmt === state.dlFormat))
        toast('下载格式：' + (state.dlFormat === 'flac' ? 'FLAC 无损' : 'MP3 320K'), 1600)
      }
    })`)
    done.push('P2-3 下载格式按钮绑定')
  }
}

fs.writeFileSync(p, s, 'utf8')
console.log('=== 已完成 ===')
done.forEach((d) => console.log('  ✓ ' + d))
if (miss.length) {
  console.log('=== 未匹配 ===')
  miss.forEach((m) => console.log('  ⚠ ' + m))
}
