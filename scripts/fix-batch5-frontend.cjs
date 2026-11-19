'use strict'
/* 第 5 批前端 P2：B6(webview监听) / B8(boot) / B59(设置面板绑定) / B61(静音) / B62(最近播放) / B64(下载扩展名) / B65(预览覆盖) / B66(搜索序号) / B87(清空队列) */
process.chdir(require('node:path').resolve(__dirname, '..'))

const fs = require('node:fs')
const p = 'public/app.js'
let s = fs.readFileSync(p, 'utf8')
const done = []
const miss = []

/* ============ B6: webview message 监听只绑一次 ============ */
{
  const old = `  if (window.chrome && window.chrome.webview && window.chrome.webview.addEventListener) {
    window.chrome.webview.addEventListener('message', (ev) => {`
  if (s.includes(old)) {
    /* 找整块并替换成调用 bindWebviewMessage() */
    const idx = s.indexOf(old)
    /* 找块结束（匹配到对应的 } ) */
    let depth = 0
    let started = false
    let end = idx
    for (let i = s.indexOf('{', idx); i < s.length; i++) {
      if (s[i] === '{') { depth++; started = true }
      else if (s[i] === '}') { depth--; if (started && depth === 0) { end = i + 1; break } }
    }
    const block = s.slice(idx, end)
    /* 提取内部处理逻辑（把 addEventListener 换成函数体） */
    const handlerBody = block
      .replace(/^\s*if \(window\.chrome[\s\S]*?addEventListener\('message', \(ev\) => \{/, '')
      .replace(/\}\)\s*$/, '')
      .replace(/\}\s*$/, '')

    const repl = `  bindWebviewMessage()`
    s = s.slice(0, idx) + repl + s.slice(end)

    /* 在模块级加单次绑定函数 */
    const anchor = 'function renderSettingsPane'
    const helper = `/* B6: 原来每开一次设置面板就往 chrome.webview 上多挂一个 message 监听，
   开过 N 次就弹 N 条「下载目录已设为…」，还连发 N 次请求。改成模块级单次绑定。 */
let __wvMsgBound = false
function bindWebviewMessage () {
  if (__wvMsgBound) return
  if (!(window.chrome && window.chrome.webview && window.chrome.webview.addEventListener)) return
  __wvMsgBound = true
  window.chrome.webview.addEventListener('message', (ev) => {
    const data = String(ev.data || '')
    if (data.startsWith('openDirFail:')) {
      const msg = data.slice('openDirFail:'.length)
      toast('打开目录失败：' + msg + '（路径已复制）', 3600)
      try { navigator.clipboard.writeText(msg) } catch (e) { }
      return
    }
    if (!data.startsWith('dirPicked:')) return
    const dir = data.slice('dirPicked:'.length)
    const inp = $('#dlDir')
    if (inp) inp.value = dir
    api('/api/download-dir?set=' + encodeURIComponent(dir)).then((r) => {
      if (r && r.writable === false) toast('目录不可写：' + (r.error || ''), 4000)
      else toast('下载目录已设为 ' + dir, 2600)
    }).catch((e) => toast('保存失败：' + e.message, 3000))
  })
}

`
    if (s.includes(anchor)) {
      s = s.replace(anchor, helper + anchor)
      done.push('B6 webview 监听单次绑定')
    } else {
      miss.push('B6 renderSettingsPane 锚点')
    }
  } else {
    miss.push('B6 webview 监听')
  }
}

/* ============ B8: boot 分段 try/catch ============ */
{
  const old = `    await loadPlaylists()
    await loadSources()`
  if (s.includes(old)) {
    s = s.replace(old, `    /* B8: 后端 /api/db 失败时不能让整个主区空白 */
    try { await loadPlaylists() } catch (e) { console.warn('[boot] 歌单加载失败', e.message) }
    try { await loadSources() } catch (e) { console.warn('[boot] 音源加载失败', e.message) }`)
    done.push('B8 boot 分段 try/catch')
  } else {
    const i = s.indexOf('async function boot')
    if (i > 0) console.log('  B8 boot 形态:\n' + s.slice(i, i + 500))
    else miss.push('B8 boot')
  }

  /* boot().catch */
  const oldBoot = `boot()`
  const idx = s.lastIndexOf('\nboot()')
  if (idx > 0 && !s.includes('boot().catch')) {
    s = s.slice(0, idx) + `\nboot().catch((e) => {
  console.error('[boot] 初始化失败', e)
  const box = $('#panelList')
  if (box) box.innerHTML = '<div class="empty"><b>初始化失败</b><br>' + esc(e && e.message || e) + '</div>'
})` + s.slice(idx + 6)
    done.push('B8 boot().catch')
  }
}

/* ============ B61: 静音状态单一事实来源 ============ */
{
  const old = `  audio.muted = false`
  const cnt = (s.match(/audio\.muted = false/g) || []).length
  if (cnt > 0 && !s.includes('state.muted = silenced')) {
    /* 只改 setVolume 里那一处：找 function setVolume */
    const i = s.indexOf('function setVolume')
    if (i > 0) {
      const seg = s.slice(i, i + 800)
      const fixed = seg.replace('audio.muted = false', `/* B61: state.muted 与 audio.muted 必须同步，否则静音按钮语义会反转 */
    const __silenced = Number(v) === 0
    audio.muted = __silenced
    state.muted = __silenced`)
      s = s.slice(0, i) + fixed + s.slice(i + 800)
      done.push('B61 静音状态同步')
    } else {
      miss.push('B61 setVolume')
    }
  }
}

/* ============ B62: addRecent 加 token 守卫 ============ */
{
  const i = s.indexOf('addRecent(song)')
  if (i > 0 && !s.includes('if (token !== state.playToken) return\n  addRecent(song)')) {
    const ls = s.lastIndexOf('\n', i) + 1
    s = s.slice(0, ls) + '  if (token !== state.playToken) return\n' + s.slice(ls)
    done.push('B62 addRecent token 守卫')
  }
}

/* ============ B64: 下载扩展名跟随格式 ============ */
{
  const old = `window.NAPI.download(d.url, safe + '.mp3')`
  if (s.includes(old)) {
    s = s.replace(old, `/* B64: 选 FLAC 时文件名也要是 .flac，否则播放器按 mp3 解码失败 */
        const __ext = state.dlFormat === 'flac' ? '.flac' : '.mp3'
        window.NAPI.download(d.url, safe + __ext)`)
    done.push('B64 下载扩展名跟随格式')
  }
}

/* ============ B65: 离开预览页清 previewCtx ============ */
{
  const old = `function switchView (name) {`
  if (s.includes(old) && !s.includes('previewCtx = null    /* B65')) {
    s = s.replace(old, `function switchView (name) {
  /* B65: 离开预览页就作废，避免迟到的响应覆盖当前页面 */
  if (name !== 'preview' && name !== 'now' && name !== 'play') previewCtx = null
`)
    done.push('B65 switchView 清 previewCtx')
  }
}

/* ============ B87: 清空队列时重置播放条 ============ */
{
  const i = s.indexOf("$('#btnQueueClear')")
  if (i > 0) {
    const seg = s.slice(i, i + 500)
    if (!seg.includes('renderNowPlaying(null')) {
      /* 找 onclick 块，在 renderQueue 前插入重置 */
      const rq = seg.indexOf('renderQueue()')
      if (rq > 0) {
        const abs = i + rq
        s = s.slice(0, abs) + `/* B87: 清空后底栏不能留残影 */
      ++state.playToken
      state.currentSong = null
      state.lyrics = []
      state.lyricIndex = -1
      state.failCount = 0
      state.__triedPlat = null
      state.__switchCount = 0
      try { renderNowPlaying(null, true) } catch (e) { }
      try { paintProgress(0); $('#totalTime').textContent = '00:00' } catch (e) { }
      ` + s.slice(abs)
        done.push('B87 清空队列重置播放条')
      } else {
        miss.push('B87 renderQueue 位置')
      }
    }
  }
}

fs.writeFileSync(p, s, 'utf8')
console.log('=== 已完成 ===')
done.forEach((d) => console.log('  ✓ ' + d))
if (miss.length) {
  console.log('=== 未匹配（需手工）===')
  miss.forEach((m) => console.log('  ⚠ ' + m))
}
