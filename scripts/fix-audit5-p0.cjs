'use strict'
/* 修 audit5-func 的 P0/P1（前端部分） */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

const results = []
function step (name, fn) {
  try { const r = fn(); results.push({ name, ok: true }); console.log('  ✓ ' + name + (r ? '  ' + r : '')) }
  catch (e) { results.push({ name, ok: false, msg: e.message }); console.log('  ✗ ' + name + '  ' + e.message) }
}

const p = 'public/app.js'
let s = fs.readFileSync(p, 'utf8')

/* ============ P0-1: checkUpdate 不依赖 AbortController 的超时 ============ */
step('P0-1 checkUpdate 用 Promise.race 超时', () => {
  const old = `  const btn = $('#btnCheckUpdate')
  const oldText = btn ? btn.textContent : ''
  if (btn) { btn.textContent = '检查中…'; btn.disabled = true }
  try {
    const ac = typeof AbortController === 'function' ? new AbortController() : null
    const to = ac ? setTimeout(() => { try { ac.abort() } catch (e) { } }, 15000) : null
    let data = null
    try {
      const res = await fetch('https://api.github.com/repos/' + GH_OWNER + '/' + GH_REPO + '/releases/latest', {
        headers: { Accept: 'application/vnd.github+json' },
        signal: ac ? ac.signal : undefined,
      })
      if (!res.ok) throw new Error('GitHub 返回 ' + res.status)
      data = await res.json()
    } finally {
      if (to) clearTimeout(to)
    }`

  if (!s.includes(old)) throw new Error('锚点不匹配')

  s = s.replace(old, () => `  const btn = $('#btnCheckUpdate')
  const oldText = btn ? btn.textContent : ''
  if (btn) { btn.textContent = '检查中…'; btn.disabled = true }
  try {
    /* 超时不能只靠 AbortController —— 国产 ROM 的旧 WebView（Chrome 53 及以下）
       根本没有这个 API，那样 15 秒超时整段失效，按钮会永久停在「检查中…」。
       这里用 Promise.race 兜底，signal 只作为「能中止就中止」的优化。 */
    const ac = typeof AbortController === 'function' ? new AbortController() : null
    const to = setTimeout(() => { try { if (ac) ac.abort() } catch (e) { } }, 15000)

    const __timeoutPromise = new Promise((_, rej) => {
      setTimeout(() => rej(Object.assign(new Error('检查更新超时'), { __timeout: true })), 15500)
    })

    const __fetchPromise = (async () => {
      const res = await fetch('https://api.github.com/repos/' + GH_OWNER + '/' + GH_REPO + '/releases/latest', {
        headers: { Accept: 'application/vnd.github+json' },
        signal: ac ? ac.signal : undefined,
      })
      if (!res.ok) throw new Error('GitHub 返回 ' + res.status)
      /* 国内常见：200 + 运营商劫持页 HTML，json() 会抛 SyntaxError */
      const text = await res.text()
      let parsed = null
      try { parsed = JSON.parse(text) } catch (e) {
        throw Object.assign(new Error('返回内容不是 GitHub 数据（可能被网络劫持）'), { __badBody: true })
      }
      return parsed
    })()

    let data = null
    try {
      data = await Promise.race([__fetchPromise, __timeoutPromise])
    } finally {
      clearTimeout(to)
    }`)

  return '已改'
})

/* ============ P0-2: 错误提示分场景 + 手动打开兜底 ============ */
step('P0-2 错误提示分场景', () => {
  const old = `  } catch (e) {
    const m = String((e && e.message) || e)
    if (/abort/i.test(m)) toast('检查更新超时，请检查网络', 2600)
    else if (/Failed to fetch|NetworkError|Load failed/i.test(m)) toast('连不上 GitHub，请检查网络或代理', 3000)
    else toast('检查更新失败：' + m, 3000)
  } finally {`

  if (!s.includes(old)) throw new Error('锚点不匹配')

  s = s.replace(old, () => `  } catch (e) {
    const m = String((e && e.message) || e)
    /* 国内网络打不开 GitHub 是常态，提示要说人话，并给手动兜底 */
    if (e && e.__timeout || /abort|timeout/i.test(m)) {
      toast('检查更新超时，请检查网络', 2600)
    } else if (e && e.__badBody) {
      toast('返回内容异常（可能被网络劫持），可手动打开下载页确认', 3600)
    } else if (/Failed to fetch|NetworkError|Load failed|fetch/i.test(m)) {
      toast('连不上 GitHub，请检查网络或代理', 3000)
    } else {
      toast('检查更新失败：' + m, 3000)
    }
    /* 兜底：把下载页放进剪贴板，用户至少能自己去看 */
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(GH_RELEASES)
      }
    } catch (err) { }
  } finally {`)

  return '已改'
})

/* ============ P1-3: openExternal 判断返回值而不是函数存在性 ============ */
step('P1-3 openExternal 修死代码', () => {
  const old = `    if (window.open) { window.open(url, '_blank'); return }
  } catch (e) { }
  try { location.href = url } catch (e) { }`

  if (!s.includes(old)) throw new Error('锚点不匹配')

  s = s.replace(old, () => `    /* window.open 这个函数在任何浏览器里都存在，判断它存在没有任何意义。
       要看返回值：被拦时返回 null，这时才走 location.href。 */
    if (typeof window.open === 'function') {
      const w = window.open(url, '_blank')
      if (w) return
    }
  } catch (e) { }
  try { location.href = url } catch (e) { }`)

  return '已改'
})

/* ============ P1-5: downloadSong 互斥提前到 await 之前 ============ */
step('P1-5 downloadSong 互斥提前', () => {
  const old = `  if (state.downloading.size > 0) {
    return toast('已有下载在进行，等它下完再点下一首', 1800)
  }`

  if (!s.includes(old)) throw new Error('锚点不匹配')

  s = s.replace(old, () => `  /* 这个锁必须放在 await 之前。原先写在 await askDownloadFormat 之后，
     选格式的整个等待窗口里锁还没上，两首歌都能穿过去 ——
     然后 window.__onDownload（全局单例）被后者覆盖，前者的 key 永久卡死。
     现在用 state.dlBusy 布尔锁，进入函数就置位，四条出口都释放。 */
  if (state.dlBusy) {
    return toast('已有下载在进行，等它下完再点下一首', 1800)
  }`)

  /* 置位 */
  s = s.replace(`  /* 先让用户选格式 */
  const pickedFmt = await askDownloadFormat(song)
  if (!pickedFmt) return`, () => `  state.dlBusy = true
  try {
  /* 先让用户选格式 */
  const pickedFmt = await askDownloadFormat(song)
  if (!pickedFmt) { state.dlBusy = false; return }`)

  return '互斥已提前'
})

fs.writeFileSync(p, s, 'utf8')

console.log('\n=== 结果 ===')
const bad = results.filter((r) => !r.ok)
console.log('成功 ' + (results.length - bad.length) + ' / 失败 ' + bad.length)
