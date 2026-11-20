'use strict'
/* 第三批：前端 P1/P2 */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

const done = []
const miss = []

const p = 'public/app.js'
let s = fs.readFileSync(p, 'utf8')

/* ============ F1: 视图令牌 ============ */
console.log('--- F1 视图令牌 ---')
{
  /* 1. 声明令牌 */
  if (!s.includes('let __viewToken = 0')) {
    const anchor = `let searchSeq = 0`
    if (s.includes(anchor)) {
      s = s.replace(anchor, () => `let __viewToken = 0
${anchor}`)
      done.push('F1a 声明 __viewToken')
    } else {
      /* 退而求其次：放在 state 定义后 */
      const m = s.match(/const state = \{[\s\S]*?\n\}/)
      if (m) {
        s = s.replace(m[0], () => m[0] + '\nlet __viewToken = 0')
        done.push('F1a 声明 __viewToken（state 后）')
      } else {
        miss.push('F1a __viewToken 声明')
      }
    }
  } else done.push('F1a 已存在')

  /* 2. switchView 里自增 */
  const sv = s.indexOf('function switchView (')
  if (sv > 0) {
    const bs = s.indexOf('{', sv)
    s = s.slice(0, bs + 1) + `\n  ++__viewToken    /* P1: 切视图就作废所有在途渲染 */` + s.slice(bs + 1)
    done.push('F1b switchView 自增令牌')
  } else {
    miss.push('F1b switchView')
  }

  /* 3. doSearch 保存令牌并校验 */
  const dsOld = `async function doSearch (append = false) {
  const kw = ($('#searchInput').value || '').trim()`
  if (s.includes(dsOld)) {
    s = s.replace(dsOld, () => `async function doSearch (append = false) {
  const kw = ($('#searchInput').value || '').trim()`)
  }
  /* 在 seq 赋值处加 vt */
  const seqOld = `  const seq = ++searchSeq`
  if (s.includes(seqOld)) {
    s = s.replace(seqOld, () => `  const seq = ++searchSeq
  const __vt = __viewToken`)
    done.push('F1c doSearch 记录令牌')
  }

  /* 4. 成功分支的守卫 */
  const okOld = `  if (seq !== searchSeq) return
  state.results = append ? state.results.concat(data.list || []) : (data.list || [])`
  if (s.includes(okOld)) {
    s = s.replace(okOld, () => `  if (seq !== searchSeq || __vt !== __viewToken || state.view !== 'search') return
  state.results = append ? state.results.concat(data.list || []) : (data.list || [])`)
    done.push('F1d doSearch 成功守卫加视图校验')
  }

  /* 5. catch 的守卫 */
  const catchOld = `  } catch (e) {
    $('#panelList').innerHTML = `<div class="empty">${svg('i-search')}<b>搜索失败</b>${esc(e.message)}</div>`
  } finally {`
  if (s.includes(catchOld)) {
    s = s.replace(catchOld, () => `  } catch (e) {
    /* P1/P2: 迟到的错误不能盖掉用户已经切过去或已经搜到的新结果 */
    if (seq !== searchSeq || __vt !== __viewToken || state.view !== 'search') return
    $('#panelList').innerHTML = \`<div class="empty">\${svg('i-search')}<b>搜索失败</b>\${esc(e.message)}</div>\`
  } finally {`)
    done.push('F1e doSearch catch 守卫')
  } else {
    const i = s.indexOf("搜索失败</b>")
    if (i > 0) console.log('  catch 现场: ' + s.slice(i - 150, i + 100).replace(/\s+/g, ' '))
    miss.push('F1e doSearch catch')
  }
}

/* ============ F2: 播放失败跳歌加 token ============ */
console.log('--- F2 跳歌 token ---')
{
  const old = `    setTimeout(() => playNext(true), 700)`
  const cnt = s.split(old).length - 1
  if (cnt === 1) {
    s = s.replace(old, () => `    const __skipTok = state.playToken
    setTimeout(() => {
      /* P1: 这 0.7 秒内用户可能已经点了别的歌，不能抢走 */
      if (__skipTok === state.playToken) playNext(true)
    }, 700)`)
    done.push('F2 跳歌加 playToken 守卫')
  } else {
    console.log('  匹配 ' + cnt + ' 处')
    miss.push('F2 跳歌定时器（匹配 ' + cnt + '）')
  }
}

/* ============ F3: 8 处 await api 加 catch ============ */
console.log('--- F3 await 错误处理 ---')
{
  const WRAPS = [
    {
      name: 'newPlaylist',
      old: `async function newPlaylist () {
  const name = prompt('新歌单名称', '新歌单')
  if (!name) return
  const data = await api('/api/playlist', { method: 'POST', body: { action: 'create', name } })
  state.playlists = data.playlists
  renderRailPlaylists()
  toast('已创建：' + name)
}`,
      neu: `async function newPlaylist () {
  const name = prompt('新歌单名称', '新歌单')
  if (!name) return
  try {
    const data = await api('/api/playlist', { method: 'POST', body: { action: 'create', name } })
    state.playlists = data.playlists
    renderRailPlaylists()
    toast('已创建：' + name)
  } catch (e) { toast('创建失败：' + (e.message || e), 3000) }
}`,
    },
    {
      name: 'renamePlaylist',
      old: `async function renamePlaylist (pl) {
  const name = prompt('重命名歌单', pl.name)
  if (!name || name === pl.name) return
  const data = await api('/api/playlist', { method: 'POST', body: { action: 'rename', id: pl.id, name } })
  state.playlists = data.playlists
  renderRailPlaylists()
  if (state.view === 'playlist') renderPlaylistView(pl.id)
}`,
      neu: `async function renamePlaylist (pl) {
  const name = prompt('重命名歌单', pl.name)
  if (!name || name === pl.name) return
  try {
    const data = await api('/api/playlist', { method: 'POST', body: { action: 'rename', id: pl.id, name } })
    state.playlists = data.playlists
    renderRailPlaylists()
    if (state.view === 'playlist') renderPlaylistView(pl.id)
  } catch (e) { toast('重命名失败：' + (e.message || e), 3000) }
}`,
    },
    {
      name: 'deletePlaylist',
      old: `async function deletePlaylist (pl) {
  if (!confirm(\`确定删除歌单「\${pl.name}」？\`)) return
  const data = await api('/api/playlist', { method: 'POST', body: { action: 'delete', id: pl.id } })
  state.playlists = data.playlists
  state.currentPlaylist = state.playlists[0] && state.playlists[0].id
  renderRailPlaylists()
  switchView('playlist')
  toast('歌单已删除')`,
      neu: `async function deletePlaylist (pl) {
  if (!confirm(\`确定删除歌单「\${pl.name}」？\`)) return
  try {
    const data = await api('/api/playlist', { method: 'POST', body: { action: 'delete', id: pl.id } })
    state.playlists = data.playlists
    state.currentPlaylist = state.playlists[0] && state.playlists[0].id
    renderRailPlaylists()
    switchView('playlist')
    toast('歌单已删除')
  } catch (e) { toast('删除失败：' + (e.message || e), 3000) }`,
    },
    {
      name: 'removeFromPlaylist',
      old: `async function removeFromPlaylist (listId, song) {
  const data = await api('/api/playlist', { method: 'POST', body: { action: 'remove', listId, id: song.id } })
  state.playlists = data.playlists
  renderRailPlaylists()
  if (state.view === 'playlist') renderPlaylistView(listId)
  toast('已从歌单移除')
}`,
      neu: `async function removeFromPlaylist (listId, song) {
  try {
    const data = await api('/api/playlist', { method: 'POST', body: { action: 'remove', listId, id: song.id } })
    state.playlists = data.playlists
    renderRailPlaylists()
    if (state.view === 'playlist') renderPlaylistView(listId)
    toast('已从歌单移除')
  } catch (e) { toast('移除失败：' + (e.message || e), 3000) }
}`,
    },
    {
      name: 'loadPlaylists',
      old: `async function loadPlaylists () {
  const data = await api('/api/db')
  state.playlists = data.playlists`,
      neu: `async function loadPlaylists () {
  const data = await api('/api/db')
  /* P3: 200 + 非 JSON 时 api() 返回 null，这里要挡住 */
  if (!data || !Array.isArray(data.playlists)) throw new Error('歌单数据异常')
  state.playlists = data.playlists`,
    },
  ]

  for (const w of WRAPS) {
    if (s.includes(w.old)) {
      s = s.replace(w.old, () => w.neu)
      done.push('F3 ' + w.name)
    } else {
      miss.push('F3 ' + w.name)
    }
  }
}

/* ============ F4: 下载文件名 esc ============ */
console.log('--- F4 下载文件名转义 ---')
{
  const old = `<td class="c-name">\${f.name}<div class="c-dir">\${f.dir || ''}</div></td>`
  if (s.includes(old)) {
    s = s.replace(old, () => `<td class="c-name">\${esc(f.name)}<div class="c-dir">\${esc(f.dir || '')}</div></td>`)
    done.push('F4a 文件名 esc')
  } else {
    const i = s.indexOf('c-name')
    if (i > 0) console.log('  现场: ' + s.slice(i - 100, i + 150).replace(/\s+/g, ' '))
    miss.push('F4a 文件名')
  }

  const old2 = `title="\${(data && data.dirs ? data.dirs.join(' | ') : dir)}"`
  if (s.includes(old2)) {
    s = s.replace(old2, () => `title="\${esc(data && data.dirs ? data.dirs.join(' | ') : dir)}"`)
    done.push('F4b 目录 title esc')
  } else {
    miss.push('F4b 目录 title')
  }
}

/* ============ F5: 导入歌单重入锁 ============ */
console.log('--- F5 导入重入锁 ---')
{
  const fnStart = s.indexOf('async function doImportPlaylist (')
  if (fnStart > 0) {
    const bs = s.indexOf('{', fnStart)
    /* 在函数体开头插入锁检查 */
    s = s.slice(0, bs + 1) + `
  /* P2: 连按回车会并发两次，生成两份重复歌单 */
  if (state.__importing) return toast('上一次导入还没结束', 1600)
  state.__importing = true
  try {` + s.slice(bs + 1)
    /* 找函数结尾，补 finally */
    let d = 1
    let e = bs + 1
    for (let k = bs + 1; k < s.length; k++) {
      if (s[k] === '{') d++
      else if (s[k] === '}') { d--; if (d === 0) { e = k; break } }
    }
    s = s.slice(0, e) + '} finally { state.__importing = false }\n' + s.slice(e)
    done.push('F5 导入重入锁')
  } else {
    miss.push('F5 doImportPlaylist')
  }
}

/* ============ F6: 设置面板切音质重载 ============ */
console.log('--- F6 设置面板音质 ---')
{
  const old = `  $('#setQuality').onchange = (e) => {
    state.quality = e.target.value
    const qs0 = $('#qualitySelect')
    if (qs0) qs0.value = state.quality
    saveSettings()
  }`
  if (s.includes(old)) {
    s = s.replace(old, () => `  $('#setQuality').onchange = (e) => {
    /* P2: 原来只存值不重载，用户以为没生效 */
    const __prev = state.quality
    state.quality = e.target.value
    const qs0 = $('#qualitySelect')
    if (qs0) qs0.value = state.quality
    saveSettings()
    if (state.currentSong) reloadCurrent(__prev)
  }`)
    done.push('F6a 设置面板切音质重载')
  } else {
    const i = s.indexOf("$('#setQuality').onchange")
    if (i > 0) console.log('  现场: ' + s.slice(i, i + 260).replace(/\s+/g, ' '))
    miss.push('F6a setQuality')
  }

  /* 动态 select 也套主题 */
  const anchor = `  bindWebviewMessage()`
  if (s.includes(anchor) && !s.includes("enhanceSelect($('#setQuality'))")) {
    s = s.replace(anchor, () => `  bindWebviewMessage()
  /* P2: 设置面板是动态生成的，boot 时的 enhanceSelect 跑在它之前，
     所以这个 select 一直是原生样式 */
  try { const __sq = $('#setQuality'); if (__sq) enhanceSelect(__sq) } catch (e) { }`)
    done.push('F6b 设置面板 select 套主题')
  }
}

/* ============ F7: state 补字段声明 ============ */
console.log('--- F7 state 字段 ---')
{
  const m = s.match(/const state = \{[\s\S]*?\n\}/)
  if (m && !m[0].includes('dlBusy')) {
    const patched = m[0].replace(/\n\}$/, `
  /* P3: 运行时锁/句柄补进初始值，读代码能一眼看出有哪些在途状态 */
  dlBusy: false,
  __importing: false,
  __qualitySwitching: false,
  __pcCleanup: null,
  __triedPlat: null,
  __switchCount: 0,
  settings: null,
}`)
    s = s.replace(m[0], () => patched)
    done.push('F7 state 补字段')
  } else {
    done.push('F7 已存在或未匹配')
  }
}

fs.writeFileSync(p, s, 'utf8')

console.log('\n=== 完成 ===')
done.forEach((d) => console.log('  ✓ ' + d))
if (miss.length) {
  console.log('\n=== 未处理 ===')
  miss.forEach((m2) => console.log('  ⚠ ' + m2))
}