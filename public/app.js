'use strict'
/* =========================================================
 * LX Phonograph · 前端主程序（v5 · 唱机重写）
 * =======================================================*/
const $ = (s) => document.querySelector(s)
const $$ = (s) => [...document.querySelectorAll(s)]
const audio = $('#audio')
const svg = (id) => `<svg><use href="#${id}"/></svg>`

const PLATFORM_NAME = { wy: '网易云音乐', tx: 'QQ 音乐', kg: '酷狗音乐' }
const QUALITY_LABEL = { '128k': '标准 128K', '320k': '较高 320K', flac: '无损 FLAC', flac24bit: 'Hi-Res 24bit' }
const qualityLabel = (q) => QUALITY_LABEL[q] || String(q || '').toUpperCase()
const RANK_TABS = {
  wy: [['hot', '热歌榜'], ['new', '新歌榜'], ['soar', '飙升榜'], ['original', '原创榜']],
  tx: [['hot', '热歌榜'], ['new', '新歌榜'], ['soar', '飙升榜'], ['original', '经典榜']],
  kg: [['top500', 'TOP500'], ['new', '新歌榜'], ['soar', '飙升榜'], ['hot', '内地榜']],
}

const state = {
  dlFormat: 'mp3',
  view: 'playlist',
  themeMode: 'light',
  panelTab: 'list',
  platform: 'wy',
  quality: '320k',
  volume: 0.8,
  muted: false,
  mode: 'loop',
  speed: 1,
  themeFromCover: false,

  keyword: '',
  results: [],
  resultsTotal: 0,
  page: 1,
  hasMore: false,
  loading: false,

  queue: [],
  index: -1,
  playing: false,
  currentSong: null,
  playToken: 0,
  failCount: 0,

  lyrics: [],
  lyricIndex: -1,
  lrcSize: 1,
  lrcOffset: 0,

  playlists: [],
  currentPlaylist: null,
  sources: [],
  history: [],
  recent: [],
  downloads: [],
  leaderboardType: 'hot',

  urlCache: new Map(),
  downloading: new Set(),
  dragIndex: -1,
  sleepAt: 0,
  sleepTimer: null,
}

/* ================= 工具 ================= */
const fmtTime = (s) => {
  if (!isFinite(s) || s < 0) s = 0
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(Math.floor(s % 60)).padStart(2, '0')
}
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

function setViewTitle (title, sub) {
  const t = $('#viewTitle')
  if (t) t.textContent = title
  const s = $('#viewSub')
  if (s) s.textContent = sub || ''
  /* 切页时立刻清掉上一页留下的操作按钮（预览页会在此之后重新设置） */
  const acts = $('#mainActions')
  if (acts) acts.innerHTML = ''
  const box = $('#panelList')
  if (box) {
    box.classList.remove('panel-fade')
    void box.offsetWidth
    box.classList.add('panel-fade')
  }
}

/* ================= 视图历史导航 ================= */
const nav = { stack: [], index: -1, silent: false }

function navPush (entry) {
  if (nav.silent) return
  const cur = nav.stack[nav.index]
  if (cur && cur.view === entry.view && cur.id === entry.id && cur.keyword === entry.keyword) return
  nav.stack = nav.stack.slice(0, nav.index + 1)
  nav.stack.push(entry)
  if (nav.stack.length > 60) nav.stack.shift()
  nav.index = nav.stack.length - 1
  navUpdate()
}
function navUpdate () {
  const b = $('#btnNavBack')
  const f = $('#btnNavFwd')
  if (b) b.disabled = nav.index <= 0
  if (f) f.disabled = nav.index >= nav.stack.length - 1
}
function navGo (delta) {
  const i = nav.index + delta
  if (i < 0 || i >= nav.stack.length) return
  nav.index = i
  const e = nav.stack[i]
  nav.silent = true
  try {
    if (e.view === 'playlistDetail') renderPlaylistView(e.id)
    else if (e.view === 'preview') previewRecPlaylist(e.platform, e.id)
    else if (e.view === 'recommend') renderRecommendView()
    else if (e.view === 'leaderboard') renderLeaderboard()
    else if (e.view === 'recent') renderRecentView()
    else if (e.view === 'search') {
      if (e.keyword) { $('#searchInput').value = e.keyword; state.keyword = e.keyword; doSearch() }
      else renderLibraryView()
    } else renderLibraryView()
  } finally {
    nav.silent = false
    navUpdate()
  }
}

/* 把原生 select 换成主题化下拉（安卓原生弹窗样式不可控） */
function enhanceSelect (sel) {
  if (!sel || sel.dataset.dd === '1') return
  sel.dataset.dd = '1'
  const wrap = document.createElement('div')
  wrap.className = 'dd'
  sel.parentNode.insertBefore(wrap, sel)
  wrap.appendChild(sel)
  sel.classList.add('dd-native')

  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'dd-btn'
  btn.innerHTML = '<span></span><svg class="dd-chev"><use href="#i-chevron"/></svg>'
  const label = btn.querySelector('span')

  const panel = document.createElement('div')
  panel.className = 'dd-panel'

  const items = Array.from(sel.options).map((o) => {
    const it = document.createElement('button')
    it.type = 'button'
    it.className = 'dd-item'
    it.dataset.v = o.value
    it.textContent = o.textContent
    it.onclick = (e) => {
      e.stopPropagation()
      sel.value = o.value
      sel.dispatchEvent(new Event('change'))
      panel.classList.remove('show')
      sync()
    }
    panel.appendChild(it)
    return it
  })

  function sync () {
    const opt = sel.options[sel.selectedIndex]
    label.textContent = opt ? opt.textContent : (sel.value || '')
    items.forEach((it) => it.classList.toggle('active', it.dataset.v === sel.value))
  }

  btn.onclick = (e) => {
    e.stopPropagation()
    document.querySelectorAll('.dd-panel.show').forEach((p) => { if (p !== panel) p.classList.remove('show') })
    panel.classList.toggle('show')
  }

  wrap.appendChild(btn)
  wrap.appendChild(panel)
  document.addEventListener('click', () => panel.classList.remove('show'))
  setInterval(sync, 500)
  sync()
}

function toast (msg, ms = 2400) {  const el = document.createElement('div')
  el.className = 'toast'
  el.textContent = msg
  $('#toastStack').appendChild(el)
  setTimeout(() => el.remove(), ms)
}

async function api (path, opts = {}) {
  if (window.__MOBILE__ && typeof window.mobileApi === 'function') {
    return await window.mobileApi(path, opts)
  }
  const res = await fetch(path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  let data = null
  try { data = await res.json() } catch (e) { data = null }
  if (!res.ok) {
    const err = new Error((data && data.error) || ('请求失败 ' + res.status))
    err.attempts = data && data.attempts
    throw err
  }
  return data
}

const LS = {
  get (k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d } catch (e) { return d } },
  set (k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch (e) {} },
  del (k) { try { localStorage.removeItem(k) } catch (e) {} },
}

/* ================= 设置 ================= */
function saveSettings () {
  LS.set('lx.settings', {
    quality: state.quality, volume: state.volume, mode: state.mode, platform: state.platform,
    speed: state.speed, themeFromCover: state.themeFromCover,
    theme: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#1f9d55',
    themeMode: state.themeMode,
    dlFormat: state.dlFormat,
  })
}
function loadSettings () {
  const s = LS.get('lx.settings', {})
  state.quality = s.quality || '320k'
  state.volume = typeof s.volume === 'number' ? s.volume : 0.8
  state.mode = s.mode || 'loop'
  state.platform = s.platform || 'wy'
  state.speed = typeof s.speed === 'number' ? s.speed : 1
  state.themeFromCover = !!s.themeFromCover
  state.dlFormat = s.dlFormat === 'flac' ? 'flac' : 'mp3'
  setThemeMode(s.themeMode || 'light', false)
  const accent = (!s.theme || s.theme === '#c8a061' || s.theme === '') ? '#1f9d55' : s.theme
  setTheme(accent, false)
}
function lighten (hex, delta = 42) {
  const m = hex.replace('#', '').match(/../g)
  return '#' + m.map((h) => Math.min(255, parseInt(h, 16) + delta).toString(16).padStart(2, '0')).join('')
}
function setTheme (color, save = true) {
  const rgb = color.replace('#', '').match(/../g).map((h) => parseInt(h, 16))
  document.documentElement.style.setProperty('--accent', color)
  document.documentElement.style.setProperty('--accent-hi', lighten(color))
  document.documentElement.style.setProperty('--accent-dim', `rgba(${rgb.join(',')},.15)`)
  $$('.theme-dot').forEach((d) => d.classList.toggle('active', d.dataset.color === color))
  if (save) saveSettings()
}
function setThemeMode (mode, save = true) {
  document.body.classList.remove('theme-light', 'theme-warm')
  if (mode === 'light') document.body.classList.add('theme-light')
  else if (mode === 'warm') document.body.classList.add('theme-warm')
  state.themeMode = mode
  $$('.mode-btn').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode))
  if (save) saveSettings()
}
function pickThemeFromCover (song) {
  if (!state.themeFromCover || !song) return
  const q = song.cover ? ('url=' + encodeURIComponent(song.cover)) : ('source=' + (song.source || 'wy') + '&id=' + encodeURIComponent(song.id))
  const img = new Image()
  img.onload = () => {
    try {
      const c = document.createElement('canvas')
      c.width = c.height = 20
      const ctx = c.getContext('2d')
      ctx.drawImage(img, 0, 0, 20, 20)
      const d = ctx.getImageData(0, 0, 20, 20).data
      let r = 0, g = 0, b = 0, n = 0
      for (let i = 0; i < d.length; i += 4) {
        const R = d[i], G = d[i + 1], B = d[i + 2]
        const lum = (R * 299 + G * 587 + B * 114) / 1000
        if (lum < 30 || lum > 225) continue
        r += R; g += G; b += B; n++
      }
      if (!n) return
      r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n)
      const mx = Math.max(r, g, b) / 255 || 1
      const boost = (v) => Math.min(255, Math.round((v / mx) * 205))
      setTheme('#' + [boost(r), boost(g), boost(b)].map((v) => v.toString(16).padStart(2, '0')).join(''))
    } catch (e) {}
  }
  img.src = '/api/pic?' + q
}

/* ================= 队列持久化 ================= */
let pendingSeek = 0
function saveQueue () { LS.set('lx.queue', { queue: state.queue.slice(0, 200), index: state.index, time: audio.currentTime || 0 }) }
function loadQueue () {
  const q = LS.get('lx.queue', null)
  if (!q || !Array.isArray(q.queue) || !q.queue.length) return
  state.queue = q.queue
  state.index = Math.min(Math.max(0, q.index || 0), q.queue.length - 1)
  state.currentSong = state.queue[state.index]
  renderNowPlaying(state.currentSong, false)
  renderQueue()
  if (q.time > 3) pendingSeek = q.time
}

/* ================= 桌面歌词 ================= */
let bc = null
try { bc = new BroadcastChannel('lx-music') } catch (e) { bc = null }
let lyricWin = null
function broadcast () {
  if (!bc) return
  bc.postMessage({
    type: 'state',
    song: state.currentSong ? { name: state.currentSong.name, singer: state.currentSong.singer, cover: coverUrl(state.currentSong) } : null,
    lyric: state.lyrics.map((l) => l.text),
    trans: state.lyrics.map((l) => l.trans || ''),
    index: state.lyricIndex,
    playing: state.playing,
    offset: state.lrcOffset,
    time: audio.currentTime || 0,
    duration: audio.duration || 0,
    quality: state.quality,
  })
}
if (bc) {
  bc.onmessage = (ev) => {
    const d = ev.data || {}
    if (d.type === 'hello') return broadcast()
    if (d.type === 'control') {
      if (d.action === 'toggle') togglePlay()
      else if (d.action === 'next') playNext(false)
      else if (d.action === 'prev') playPrev()
    }
  }
}
function openDesktopLyric () {
  /* 手机端：系统级悬浮窗歌词 */
  if (window.__MOBILE__ && window.NAPI && window.NAPI.lyricShow) {
    if (!window.NAPI.lyricCanShow()) {
      toast('需要「显示在其他应用上层」权限', 3000)
      window.NAPI.lyricRequestPermission()
      return
    }
    if (window.NAPI.lyricVisible()) {
      window.NAPI.lyricHide()
      toast('桌面歌词已关闭', 1600)
    } else {
      const l = state.lyrics[state.lyricIndex]
      const n = state.lyrics[state.lyricIndex + 1]
      window.NAPI.lyricShow(l ? l.text : '留声', n ? n.text : '')
      toast('桌面歌词已开启，可拖动调整位置', 2600)
    }
    return
  }
  if (window.chrome && window.chrome.webview) { window.chrome.webview.postMessage('desktopLyric'); return }
  if (lyricWin && !lyricWin.closed) { lyricWin.focus(); return }
  lyricWin = window.open('/lyric-window.html', 'lx-lyric', 'width=1000,height=210,menubar=no,toolbar=no,location=no,status=no,resizable=yes')
  if (!lyricWin) toast('弹窗被拦截', 2600)
  else setTimeout(broadcast, 600)
}

/* ================= 启动 ================= */
async function boot () {
  loadSettings()
  state.history = LS.get('lx.history', []) || []
  state.recent = LS.get('lx.recent', []) || []
  state.downloads = LS.get('lx.downloads', []) || []
  $('#qualitySelect').value = state.quality
  $('#platformSelect').value = state.platform
  setVolume(state.volume, true)
  updateModeIcon(); updateSpeedBtn()
  bindEvents()
  loadQueue()
  await loadPlaylists()
  await loadSources()
  renderLibraryView()
  nav.stack = [{ view: 'playlist' }]
  nav.index = 0
  navUpdate()
  $$('select').forEach(enhanceSelect)

  /* 后台预热音源脚本，第一次点歌就不用等脚本加载 */
  setTimeout(() => {
    try {
      if (window.preloadScripts) window.preloadScripts()
      else if (window.mobileApi) window.mobileApi('/api/sources').catch(() => {})
    } catch (e) {}
  }, 1200)
}

function bindEvents () {
  $('#btnSearch').onclick = () => doSearch()
  $('#searchInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch() })
  $('#searchInput').addEventListener('input', (e) => $('.search-wrap').classList.toggle('has-value', !!e.target.value))
  $('#searchInput').addEventListener('focus', showHistory)
  $('#btnClearSearch').onclick = () => {
    $('#searchInput').value = ''
    $('.search-wrap').classList.remove('has-value')
    $('#searchInput').focus()
  }

  $('#platformSelect').onchange = (e) => {
    state.platform = e.target.value
    saveSettings()
    const sub = $('#viewSub')
    if (sub && state.view === 'search') sub.textContent = PLATFORM_NAME[state.platform]
    toast('曲库：' + PLATFORM_NAME[state.platform], 1200)
    if (state.view === 'leaderboard') renderLeaderboard()
    else if (state.view === 'recommend') renderRecommendView()
    else if (state.view === 'playlist') renderLibraryView()
    else if (state.view === 'search' && state.keyword) doSearch()
  }
  $('#qualitySelect').onchange = (e) => {
    state.quality = e.target.value
    saveSettings()
    if (state.currentSong) reloadCurrent()
  }

  $$('.rail-item').forEach((b) => { b.onclick = () => switchView(b.dataset.view) })
  $$('.mtab').forEach((b) => {
    b.onclick = () => {
      const v = b.dataset.mview
      $$('.mtab').forEach((x) => x.classList.toggle('active', x === b))
      if (v === 'now') {
        if (document.body.classList.contains('m-deck')) document.body.classList.remove('m-deck')
        else document.body.classList.add('m-deck')
        return
      }
      document.body.classList.remove('m-deck')
      switchView(v)
    }
  })
  $('#btnNavBack').onclick = () => navGo(-1)
  $('#btnNavFwd').onclick = () => navGo(1)
  $('#btnNavHome').onclick = () => switchView('playlist')
  document.addEventListener('mouseup', (e) => {
    if (e.button === 3) { e.preventDefault(); navGo(-1) }
    if (e.button === 4) { e.preventDefault(); navGo(1) }
  })
  $('#btnQueue').onclick = () => toggleQueue()
  $('#btnQueueClose').onclick = () => toggleQueue(false)
  if ($('#btnNewPlaylist')) $('#btnNewPlaylist').onclick = () => newPlaylist()

  $('#btnPlay').onclick = togglePlay
  $('#btnPrev').onclick = playPrev
  $('#btnNext').onclick = () => playNext(false)
  $('#btnMode').onclick = cycleMode
  $('#btnSpeed').onclick = cycleSpeed
  $('#btnMute').onclick = toggleMute
  $('#btnLike').onclick = () => state.currentSong && addToPlaylist(state.currentSong, 'default', true)
  $('#btnDownload').onclick = () => state.currentSong && downloadSong(state.currentSong)
  $('#btnDesktop').onclick = openDesktopLyric
  $('#btnFullLyric').onclick = () => $('#lyricLayer').classList.add('show')
  $('#closeLyric').onclick = () => $('#lyricLayer').classList.remove('show')
  $('#lyricPrev').onclick = () => playPrev()
  $('#lyricNext').onclick = () => playNext()
  $('#lyricPlay').onclick = () => togglePlay()
  /* 歌词页里的播放图标跟随状态 */
  const syncLyricPlayBtn = () => {
    const b = $('#lyricPlay')
    if (!b) return
    b.querySelector('use').setAttribute('href', audio.paused ? '#i-play' : '#i-pause')
  }
  setInterval(syncLyricPlayBtn, 400)
  $('#btnQueueClear').onclick = () => {
    state.queue = []; state.index = -1
    audio.pause(); audio.removeAttribute('src')
    renderQueue(); saveQueue()
    toast('队列已清空')
  }
  $('#btnOpenSources').onclick = () => { $('#overlaySources').classList.add('show'); renderSourcesPane() }
  $('#btnOpenSettings').onclick = () => { $('#overlaySettings').classList.add('show'); renderSettingsPane() }
  $('#btnDoImport').onclick = () => doImportPlaylist()
  $('#importPlaylistUrl').addEventListener('keydown', (e) => { if (e.key === 'Enter') doImportPlaylist() })
  $$('[data-close]').forEach((b) => { b.onclick = () => $('#' + b.dataset.close).classList.remove('show') })
  $$('.overlay').forEach((o) => { o.onclick = (e) => { if (e.target === o) o.classList.remove('show') } })

  if ($('#btnLrcBigger')) $('#btnLrcBigger').onclick = () => adjustLrcSize(1)
  if ($('#btnLrcSmaller')) $('#btnLrcSmaller').onclick = () => adjustLrcSize(-1)
  if ($('#btnLrcPlus')) $('#btnLrcPlus').onclick = () => adjustLrcOffset(0.5)
  if ($('#btnLrcMinus')) $('#btnLrcMinus').onclick = () => adjustLrcOffset(-0.5)

  bindProgress(); bindVolumeKnob()

  audio.addEventListener('timeupdate', onTimeUpdate)
  audio.addEventListener('durationchange', () => { $('#totalTime').textContent = fmtTime(audio.duration) })
  audio.addEventListener('loadedmetadata', () => {
    audio.playbackRate = state.speed
    if (pendingSeek && audio.duration) { audio.currentTime = Math.min(pendingSeek, audio.duration - 2); pendingSeek = 0 }
  })
  audio.addEventListener('play', () => {
    state.playing = true
    updatePlayButton()
    $('#vinyl').classList.add('playing')
    $('#tonearm').classList.add('on')
    $('#disc').classList.add('playing')
    broadcast()
  })
  audio.addEventListener('pause', () => {
    state.playing = false
    updatePlayButton()
    $('#vinyl').classList.remove('playing')
    $('#tonearm').classList.remove('on')
    $('#disc').classList.remove('playing')
    broadcast()
  })
  audio.addEventListener('playing', () => { state.failCount = 0 })
  audio.addEventListener('ended', () => { state.mode === 'single' ? replay() : playNext(true) })
  audio.addEventListener('error', onAudioError)

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.ctx-menu')) hideContextMenu()
    if (!e.target.closest('.search-wrap')) $('#searchHistory').classList.remove('show')
  })
  $('#panelList').addEventListener('scroll', () => {
    if (state.view !== 'recommend') return
    if (Date.now() < recCooldown) return
    const el = $('#panelList')
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 260) loadRecPage(false)
  })
  document.addEventListener('keydown', onHotkey)
  window.addEventListener('beforeunload', saveQueue)
}

/* ================= 进度 / 音量 ================= */
function bindProgress () {
  const bar = $('#progress')
  let dragging = false
  const posOf = (e) => {
    const r = bar.getBoundingClientRect()
    return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
  }
  bar.addEventListener('mousedown', (e) => {
    if (!audio.duration) return
    dragging = true
    bar.classList.add('dragging')
    paintProgress(posOf(e))
    audio.currentTime = posOf(e) * audio.duration
  })
  window.addEventListener('mousemove', (e) => {
    if (!audio.duration) return
    const p = posOf(e)
    if (bar.contains(e.target) || dragging) {
      $('#progressFloat').style.left = (p * 100) + '%'
      $('#progressFloat').textContent = fmtTime(p * audio.duration)
    }
    if (dragging) { paintProgress(p); audio.currentTime = p * audio.duration }
  })
  window.addEventListener('mouseup', () => { dragging = false; bar.classList.remove('dragging') })
}
function paintProgress (p) {
  $('#progressInner').style.width = (p * 100) + '%'
  $('#progressDot').style.left = (p * 100) + '%'
  $('#curTime').textContent = fmtTime(p * (audio.duration || 0))
}
function bindVolumeKnob () {
  const bar = $('#volume')
  let dragging = false
  const apply = (e) => {
    const r = bar.getBoundingClientRect()
    setVolume(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)))
  }
  bar.addEventListener('mousedown', (e) => { dragging = true; apply(e) })
  window.addEventListener('mousemove', (e) => { if (dragging) apply(e) })
  window.addEventListener('mouseup', () => { if (dragging) { dragging = false; saveSettings() } })
}
function setVolume (v, silent) {
  state.volume = v
  audio.volume = v
  audio.muted = false
  const fill = $('#volumeInner')
  if (fill) fill.style.width = (v * 100) + '%'
  const num = $('#volNum') || { textContent: '', style: {}, classList: { add () {}, remove () {}, toggle () {} }, value: '', addEventListener () {} }
  if (num) num.textContent = Math.round(v * 100)
  $('#btnMute').innerHTML = svg(v === 0 ? 'i-mute' : 'i-volume')
  if (!silent) saveSettings()
}
function toggleMute () {
  state.muted = !state.muted
  audio.muted = state.muted
  $('#btnMute').innerHTML = svg(state.muted ? 'i-mute' : 'i-volume')
  toast(state.muted ? '已静音' : '取消静音', 1200)
}

/* ================= 播放核心 ================= */
function songParams (song, only) {
  const p = new URLSearchParams({
    source: song.source || 'wy', id: song.id, quality: state.quality,
    name: song.name || '', singer: song.singer || '', album: song.album || '',
    interval: song.durationText || '', mediaMid: song.mediaMid || '',
  })
  if (only) p.set('only', only)
  if (typeof state.dlFormat === 'string') p.set('format', state.dlFormat)
  return p
}
function coverUrl (song) {
  if (!song) return ''
  if (song.cover) return song.cover
  return '/api/pic?source=' + (song.source || 'wy') + '&id=' + encodeURIComponent(song.id)
}
function cacheKey (song) { return (song.source || 'wy') + '|' + song.id + '|' + state.quality }

function playSong (song, list) {
  const queue = (list && list.length) ? list.slice() : [song]
  state.queue = queue
  state.index = Math.max(0, queue.findIndex((s) => String(s.id) === String(song.id) && (s.source || 'wy') === (song.source || 'wy')))
  if (state.index < 0) state.index = 0
  startSong(song)
}

function setSrc (text) {
  const el = $('#srcBadge') || { textContent: '', style: {}, classList: { add () {}, remove () {}, toggle () {} }, value: '', addEventListener () {} }
  if (el) el.textContent = text
}

/* 音频地址：桌面端走 /api/stream 代理；手机端直接解析出直链（WebView 播放） */
const __urlCache = new Map()
const URL_TTL = 5 * 60 * 1000

async function streamSrc (song, only) {
  const ck = song.source + '|' + song.id + '|' + (only || '') + '|' + state.quality + '|' + state.dlFormat
  const hit = __urlCache.get(ck)
  if (hit && hit.exp > Date.now()) return hit.url
  const url = await __streamSrcInner(song, only)
  if (url) __urlCache.set(ck, { url, exp: Date.now() + URL_TTL })
  return url
}

async function __streamSrcInner (song, only) {
  const qs = songParams(song, only).toString()
  if (!window.__MOBILE__) return '/api/stream?' + qs
  try {
    const d = await api('/api/url?' + qs)
    return (d && d.url) || ''
  } catch (e) {
    return ''
  }
}


/* 从 "4:16" 解析秒数 */
function parseDurText (t) {
  if (!t) return 0
  const m = String(t).match(/(\d+):(\d+)/)
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

async function startSong (song, only) {
  const token = ++state.playToken
  const __songKey = String(song.id)
  if (!state.__lastSongKey || state.__lastSongKey !== __songKey) {
    state.__lastSongKey = __songKey
    state.__triedPlat = new Set()
    state.__switchCount = 0
  }
  state.currentSong = song
  renderNowPlaying(song, true)
  pickThemeFromCover(song)
  state.lyrics = []
  state.lyricIndex = -1
  state.lrcOffset = 0
  updateOffsetTip()
  $('#lyricInner').innerHTML = '<p class="lyric-empty">歌词加载中…</p>'
  $('#lyricRoll').innerHTML = '<p class="lyric-empty">歌词加载中…</p>'

  audio.src = await streamSrc(song, only)
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
  setTimeout(__pcCheck, 4000)
  audio.play().catch(() => {})

  try {
    const ck = cacheKey(song) + (only || '')
    const cached = state.urlCache.get(ck)
    if (cached && Date.now() - cached.ts < 5 * 60e3) {
      setSrc(cached.provider + ' · ' + cached.quality)
    } else {
      const info = await api('/api/url?' + songParams(song, only).toString())
      if (token !== state.playToken) return
      state.urlCache.set(ck, { provider: info.provider, quality: info.quality, ts: Date.now() })
      setSrc(info.provider + ' · ' + info.quality)
    }
  } catch (e) {
    if (token !== state.playToken) return
    setSrc('解析失败')
    const detail = e.attempts && e.attempts.length ? e.attempts.map((a) => `${a.name}(${a.ms}ms)`).join(' → ') : e.message
    toast('播放地址解析失败：' + detail, 4200)
  }

  try {
    const ly = await api('/api/lyric?source=' + (song.source || 'wy') + '&id=' + encodeURIComponent(song.id) + '&interval=' + encodeURIComponent(song.durationText || ''))
    if (token !== state.playToken) return
    state.lyrics = parseLrc(ly.lyric, ly.tlyric)
    renderLyric(); renderPanelLyric(); broadcast()
  } catch (e) {
    $('#lyricInner').innerHTML = '<p class="lyric-empty">暂无歌词</p>'
    $('#lyricRoll').innerHTML = '<p class="lyric-empty">暂无歌词</p>'
  }
  addRecent(song)
  renderQueue()
  saveQueue()
}

function renderNowPlaying (song, resetBadge) {
  if (!song) return
  const cover = coverUrl(song)
  $('#coverImg').src = cover
  const npCover = $('#npCover')
  if (npCover) npCover.src = cover
  $('#lyricCover').src = cover
  $('#lyricBg').style.backgroundImage = `url('${cover}')`
  $('#npName').textContent = song.name
  $('#npSinger').textContent = song.singer
  const npTitle = $('#npTitle')
  const npArtist = $('#npArtist')
  if (npTitle) npTitle.textContent = song.name
  if (npArtist) npArtist.textContent = song.singer
  $('#lyricName').textContent = song.name
  $('#lyricSinger').textContent = song.singer
  if (resetBadge) setSrc('')
  $$('.song-list tbody tr').forEach((tr) => {
    tr.classList.toggle('playing', state.currentSong && tr.dataset.id === String(song.id))
  })
  renderQueue()
}

function addRecent (song) {
  const key = (song.source || 'wy') + ':' + song.id
  state.recent = [song].concat(state.recent.filter((s) => (s.source || 'wy') + ':' + s.id !== key)).slice(0, 30)
  LS.set('lx.recent', state.recent)
}

function updatePlayButton () { $('#btnPlay').innerHTML = svg(state.playing ? 'i-pause' : 'i-play') }

function togglePlay () {
  if (!audio.src) {
    if (state.queue.length) startSong(state.queue[Math.max(0, state.index)] || state.queue[0])
    else toast('队列是空的，先从右侧挑一首')
    return
  }
  if (audio.paused) audio.play().catch(() => {}); else audio.pause()
}
function replay () { audio.currentTime = 0; audio.play().catch(() => {}) }

function playNext (auto) {
  if (!state.queue.length) return
  let next
  if (state.mode === 'random' && state.queue.length > 1) {
    do { next = Math.floor(Math.random() * state.queue.length) } while (next === state.index)
  } else next = (state.index + 1) % state.queue.length
  state.index = next
  startSong(state.queue[next])
}
function playPrev () {
  if (!state.queue.length) return
  state.index = (state.index - 1 + state.queue.length) % state.queue.length
  startSong(state.queue[state.index])
}
function playAt (i) {
  if (i < 0 || i >= state.queue.length) return
  state.index = i
  startSong(state.queue[i])
}
function playNextSong (song) {
  state.queue.splice(state.index + 1, 0, song)
  renderQueue(); saveQueue()
  toast('已插入下一首：' + song.name)
}

function cycleMode () {
  const order = ['loop', 'single', 'random']
  state.mode = order[(order.indexOf(state.mode) + 1) % 3]
  updateModeIcon(); saveSettings()
  toast(state.mode === 'loop' ? '列表循环' : state.mode === 'single' ? '单曲循环' : '随机播放', 1200)
}
function updateModeIcon () {
  const map = { loop: ['i-loop', '列表循环'], single: ['i-single', '单曲循环'], random: ['i-random', '随机播放'] }
  const [icon, title] = map[state.mode] || map.loop
  $('#btnMode').innerHTML = svg(icon)
  $('#btnMode').title = title
  $('#btnMode').classList.toggle('on', state.mode !== 'loop')
}

const SPEEDS = [1, 1.25, 1.5, 2, 0.75, 0.5]
function cycleSpeed () {
  const i = SPEEDS.indexOf(state.speed)
  state.speed = SPEEDS[(i + 1) % SPEEDS.length]
  audio.playbackRate = state.speed
  updateSpeedBtn(); saveSettings()
  toast('速度 ' + state.speed + '×', 1100)
}
function updateSpeedBtn () {
  $('#btnSpeed').textContent = state.speed === 1 ? '1.0×' : state.speed + '×'
  $('#btnSpeed').classList.toggle('on', state.speed !== 1)
  const rpm = $('#rpmLabel')
  if (rpm) rpm.textContent = state.speed === 1 ? '33⅓' : (state.speed > 1 ? '45' : '16⅔')
}

let retryLock = false
async function onAudioError () {
  if (!audio.src) return
  state.failCount++

  /* 先给这首歌换一个源重试一次（探活会挑别的脚本/CDN），再考虑跳过 */
  if (!retryLock && state.failCount <= 2 && state.currentSong) {
    retryLock = true
    try {
      toast('这首歌换个音源重试…', 1600)
      const next = await streamSrc(state.currentSong)
      if (next && next !== audio.src) {
        audio.src = next
        try { audio.load() } catch (e) {}
        await audio.play()
        retryLock = false
        return
      }
    } catch (e) { /* 重试也失败，往下跳歌 */ }
    retryLock = false
  }

  if (state.failCount > 3) {
    state.failCount = 0
    audio.pause()
    toast('连续播放失败，请换个音源或稍后重试', 3600)
    return
  }
  toast('播放失败，跳过这首…', 1400)
  setTimeout(() => playNext(true), 700)
}

async function reloadCurrent () {
  if (!state.currentSong) return
  const t = audio.currentTime
  const prevSrc = audio.src
  const prevQuality = state.quality
  const wanted = state.quality
  toast('正在切换音质…', 1200)

  const next = await streamSrc(state.currentSong)

  /* 切不回来就原地恢复，绝不让播放中断 */
  let settled = false
  const fallback = (msg) => {
    if (settled) return
    settled = true
    clearTimeout(timer)
    state.quality = prevQuality
    saveSettings()
    if (prevSrc) {
      audio.src = prevSrc
      audio.currentTime = t
      audio.play().catch(() => {})
    }
    $$('.dd-panel .dd-item').forEach((it) => it.classList.toggle('active', it.dataset.v === state.quality))
    toast(msg || ('这首歌没有 ' + qualityLabel(wanted) + ' 音质，已保持原音质'), 3000)
  }

  if (!next) return fallback()

  const timer = setTimeout(() => fallback('该音质加载超时，已保持原音质'), 3500)

  audio.addEventListener('error', function onErr () {
    audio.removeEventListener('error', onErr)
    fallback()
  }, { once: true })

  audio.addEventListener('canplay', function onOk () {
    if (settled) return
    settled = true
    clearTimeout(timer)
    audio.currentTime = t
    audio.play().catch(() => {})
    toast('音质：' + qualityLabel(state.quality), 1400)
  }, { once: true })

  audio.src = next
  try { audio.load() } catch (e) {}
}

/* 从上一个播放地址推断当前音质（切换失败时回退用） */
function prevAudioQuality (src) {
  if (!src) return state.quality
  const m = String(src).match(/quality=([a-z0-9]+)/i)
  return m ? m[1] : state.quality
}


/* 下载前询问格式：返回 'mp3' | 'flac' | null */
function askDownloadFormat (song) {
  return new Promise((resolve) => {
    const old = document.getElementById('__fmtDlg')
    if (old) old.remove()

    const wrap = document.createElement('div')
    wrap.id = '__fmtDlg'
    wrap.style.cssText = 'position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,.42);display:flex;align-items:center;justify-content:center'
    wrap.innerHTML = ''
      + '<div style="background:var(--panel-a,#fff);border-radius:10px;padding:22px 24px;min-width:340px;box-shadow:0 18px 48px rgba(0,0,0,.28)">'
      + '  <div style="font-size:16px;font-weight:600;color:var(--text,#222);margin-bottom:6px">选择下载格式</div>'
      + '  <div style="font-size:12.5px;color:var(--text-3,#888);margin-bottom:18px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (song ? (song.name + ' - ' + song.singer) : '') + '</div>'
      + '  <div style="display:flex;gap:10px;margin-bottom:16px">'
      + '    <button data-f="mp3" style="flex:1;padding:14px 10px;border:1px solid var(--border-strong,#ccc);border-radius:8px;background:var(--bg-input,#f7f7f7);color:var(--text,#222);cursor:pointer;font-size:13.5px">MP3 320K<br><span style="font-size:11px;color:var(--text-3,#999)">兼容性最好</span></button>'
      + '    <button data-f="flac" style="flex:1;padding:14px 10px;border:1px solid var(--border-strong,#ccc);border-radius:8px;background:var(--bg-input,#f7f7f7);color:var(--text,#222);cursor:pointer;font-size:13.5px">FLAC 无损<br><span style="font-size:11px;color:var(--text-3,#999)">体积较大</span></button>'
      + '  </div>'
      + '  <div style="text-align:right"><button data-f="cancel" style="padding:7px 16px;border:1px solid var(--border,#ddd);border-radius:6px;background:transparent;color:var(--text-3,#888);cursor:pointer;font-size:12.5px">取消</button></div>'
      + '</div>'

    const close = (v) => { wrap.remove(); resolve(v) }
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap) return close(null)
      const btn = e.target.closest('button[data-f]')
      if (!btn) return
      const f = btn.dataset.f
      close(f === 'cancel' ? null : f)
    })
    document.body.appendChild(wrap)
  })
}

async function downloadSong (song) {
  const key = song.source + song.id
  if (state.downloading.has(key)) return toast('正在下载中…', 1200)

  /* 先让用户选格式 */
  const pickedFmt = await askDownloadFormat(song)
  if (!pickedFmt) return
  state.dlFormat = pickedFmt
  saveSettings()

  /* 手机端：走原生下载（保存到「下载/留声」） */
  if (window.__MOBILE__ && window.NAPI && window.NAPI.download) {
    state.downloading.add(key)
    toast('开始下载：' + song.name + '（' + (state.dlFormat === 'flac' ? 'FLAC' : 'MP3') + '）')
    try {
      const d = await api('/api/url?' + songParams(song).toString())
      if (!d || !d.url) throw new Error('取流失败')
      const safe = (song.singer + ' - ' + song.name).replace(/[\\/:*?"<>|\r\n]/g, '_').slice(0, 80)
      window.__onDownload = (r) => {
        state.downloading.delete(key)
        if (r && r.ok) {
          toast('已保存：' + r.path, 3600)
          state.downloads.unshift({ name: song.name, singer: song.singer, quality: state.quality, ts: Date.now() })
          state.downloads = state.downloads.slice(0, 30)
          LS.set('lx.downloads', state.downloads)
        } else {
          toast('下载失败：' + ((r && r.error) || '未知错误'), 3600)
        }
      }
      window.NAPI.download(d.url, safe + '.mp3')
    } catch (e) {
      state.downloading.delete(key)
      toast('下载失败：' + e.message, 3000)
    }
    return
  }

  state.downloading.add(key)
  toast('开始下载：' + song.name + '（' + (state.dlFormat === 'flac' ? 'FLAC' : 'MP3') + '）', 2200)

  /* 优先：后端直接存到「设置里的下载目录」，完全不弹窗 */
  try {
    const sp0 = songParams(song)
    sp0.set('save', '1')
    const r0 = await api('/api/download?' + sp0.toString())
    if (r0 && r0.ok) {
      toast('已保存：' + r0.name + '（' + (r0.size / 1048576).toFixed(1) + ' MB）', 3600)
      state.downloads.unshift({ name: song.name, singer: song.singer, quality: state.quality, ts: Date.now(), path: r0.path })
      state.downloads = state.downloads.slice(0, 30)
      LS.set('lx.downloads', state.downloads)
      state.downloading.delete(key)
      try { renderList && renderList() } catch (e) { }
      return
    }
  } catch (e) {
    /* 直存失败（比如目录没权限）→ 继续走下一步 */
  }


  try {
    const p = songParams(song)
    /* 直存失败：只提示，不再触发浏览器下载（那是弹窗来源） */
    toast('下载失败：目录不可写，请在设置里换个位置（如 D:\\Music）', 4200)
  } catch (e) {
    toast('下载失败：' + e.message, 3000)
  } finally {
    setTimeout(() => {
      state.downloading.delete(key)
      try { renderList && renderList() } catch (e) {}
    }, 3000)
  }
}

/* ================= 歌词 ================= */
function parseLrc (lrc, tlrc) {
  const map = new Map()
  const push = (text, t, trans) => {
    if (!map.has(t)) map.set(t, { t, text: '', trans: '' })
    const o = map.get(t)
    if (trans) o.trans = text; else o.text = text
  }
  const parseOne = (src, isTrans) => {
    if (!src) return
    for (const line of src.split(/\r?\n/)) {
      const tags = [...line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)]
      if (!tags.length) continue
      const text = line.replace(/\[[^\]]*\]/g, '').trim()
      for (const x of tags) push(text, Number(x[1]) * 60 + Number(x[2]), isTrans)
    }
  }
  parseOne(lrc, false); parseOne(tlrc, true)
  return [...map.values()].filter((l) => l.text).sort((a, b) => a.t - b.t)
}

function renderLyric () {
  const box = $('#lyricInner')
  if (!state.lyrics.length) { box.innerHTML = '<p class="lyric-empty">暂无歌词</p>'; return }
  box.style.fontSize = (state.lrcSize * 100) + '%'
  box.innerHTML = state.lyrics.map((l, i) =>
    `<p class="lyric-line" data-i="${i}">${esc(l.text)}${l.trans ? '<br/><span style="font-size:.72em;opacity:.6">' + esc(l.trans) + '</span>' : ''}</p>`
  ).join('')
  box.querySelectorAll('.lyric-line').forEach((el) => {
    el.onclick = () => {
      const t = state.lyrics[Number(el.dataset.i)].t - state.lrcOffset
      if (audio.duration) audio.currentTime = Math.max(0, t)
    }
  })
  state.lyricIndex = -1
}

function renderPanelLyric () {
  const box = $('#lyricRoll')
  if (!state.lyrics.length) { box.innerHTML = '<p class="lyric-empty">暂无歌词</p>'; return }
  box.innerHTML = state.lyrics.map((l, i) =>
    `<p class="ll ${i === state.lyricIndex ? 'active' : ''}" data-i="${i}">${esc(l.text)}</p>`).join('')
  box.querySelectorAll('.ll').forEach((el) => {
    el.onclick = () => {
      const t = state.lyrics[Number(el.dataset.i)].t - state.lrcOffset
      if (audio.duration) audio.currentTime = Math.max(0, t)
    }
  })
  scrollPanelLyric()
}
function scrollPanelLyric () {
  const box = $('#lyricRoll')
  if (!box) return
  const el = box.querySelector('.ll.active')
  if (!el) return
  const target = el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2
  box.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
}

function syncLyric (time) {
  if (!state.lyrics.length) return
  const t = time + state.lrcOffset
  let idx = -1
  for (let i = 0; i < state.lyrics.length; i++) { if (state.lyrics[i].t <= t + 0.15) idx = i; else break }
  if (idx === state.lyricIndex) return
  state.lyricIndex = idx
  const lines = $('#lyricInner').querySelectorAll('.lyric-line')
  lines.forEach((el, i) => el.classList.toggle('active', i === idx))
  if (idx >= 0 && lines[idx]) {
    const h = $('#lyricScroll').clientHeight / 2
    const offset = lines[idx].offsetTop + lines[idx].clientHeight / 2
    $('#lyricInner').style.transform = `translateY(${-offset + h}px)`
  }
  const roll = $('#lyricRoll').querySelectorAll('.ll')
  roll.forEach((el, i) => el.classList.toggle('active', i === idx))
  scrollPanelLyric()
  broadcast()
  /* 手机端：同步到系统悬浮歌词 */
  if (window.__MOBILE__ && window.NAPI && window.NAPI.lyricUpdate) {
    try {
      const cur = state.lyrics[idx]
      const nxt = state.lyrics[idx + 1]
      window.NAPI.lyricUpdate(cur ? cur.text : '', nxt ? nxt.text : '')
    } catch (e) {}
  }
}
function adjustLrcSize (dir) {
  state.lrcSize = Math.min(1.6, Math.max(0.7, state.lrcSize + dir * 0.1))
  $('#lyricInner').style.fontSize = (state.lrcSize * 100) + '%'
}
function adjustLrcOffset (d) {
  state.lrcOffset = Math.round((state.lrcOffset + d) * 10) / 10
  updateOffsetTip(); state.lyricIndex = -1; broadcast()
}
function updateOffsetTip () { const el = $('#lrcOffsetTip'); if (!el) return; el.textContent = '偏移 ' + (state.lrcOffset || 0).toFixed(1) + 's' }

function onTimeUpdate () {
  const d = audio.duration || 0
  paintProgress(d ? audio.currentTime / d : 0)
  if (d) $('#totalTime').textContent = fmtTime(d)
  syncLyric(audio.currentTime)
  const now = Date.now()
  if (now - (state.lastBc || 0) > 800) { state.lastBc = now; broadcast() }
}

/* ================= 搜索 ================= */
function showHistory () {
  const box = $('#searchHistory')
  if (!state.history.length) return
  box.innerHTML = `<div class="sh-head"><span>搜索历史</span><button id="btnClearHistory">清空</button></div>
    <div class="sh-chips">${state.history.map((h) => `<span class="sh-chip" data-kw="${esc(h)}">${esc(h)}</span>`).join('')}</div>`
  box.classList.add('show')
  box.querySelectorAll('.sh-chip').forEach((c) => {
    c.onclick = () => {
      $('#searchInput').value = c.dataset.kw
      $('.search-wrap').classList.add('has-value')
      box.classList.remove('show')
      doSearch()
    }
  })
  $('#btnClearHistory').onclick = () => { state.history = []; LS.set('lx.history', []); box.classList.remove('show') }
}

async function doSearch (append = false) {
  const kw = $('#searchInput').value.trim()
  if (!kw || state.loading) return
  state.keyword = kw
  state.view = 'search'
  state.loading = true
  if (!append) { state.page = 1; state.results = [] }
  state.history = [kw, ...state.history.filter((x) => x !== kw)].slice(0, 12)
  LS.set('lx.history', state.history)
  $$('.rail-item').forEach((b) => b.classList.remove('active'))
  $('#searchHistory').classList.remove('show')
  if (!append) $('#panelList').innerHTML = skeletonList()
  try {
    const data = await api('/api/search?kw=' + encodeURIComponent(kw) + '&limit=50&page=' + state.page + '&source=' + state.platform)
    state.results = append ? state.results.concat(data.list || []) : (data.list || [])
    state.resultsTotal = data.total || state.results.length
    state.hasMore = state.results.length < state.resultsTotal && (data.list || []).length >= 20
    renderSearchResults()
  } catch (e) {
    $('#panelList').innerHTML = `<div class="empty">${svg('i-search')}<b>搜索失败</b>${esc(e.message)}</div>`
  } finally { state.loading = false }
}

function skeletonList () {
  return `<h1 class="sk" style="width:120px;height:14px;margin:4px 6px 12px"></h1>
    ${Array.from({ length: 9 }).map(() => `<div class="skeleton-row"><div class="sk sk-cover"></div><div class="sk sk-line"></div></div>`).join('')}`
}

function renderSearchResults () {
  setViewTitle('搜索 ' + state.keyword, PLATFORM_NAME[state.platform] + ' · ' + state.resultsTotal + ' 首')
  const box = $('#panelList')
  box.innerHTML = `
    <table class="song-list"><tbody>${state.results.map((s, i) => songRow(s, i)).join('')}</tbody></table>
    ${state.hasMore ? `<div class="load-more"><button class="btn-ghost" id="btnLoadMore">加载更多</button></div>` : ''}`
  bindListEvents(state.results, $('#panelList'))
  if (state.hasMore) $('#btnLoadMore').onclick = () => { state.page++; doSearch(true) }
}

/* ================= 发现 ================= */
const HOT_WORDS = ['周杰伦', '林俊杰', '陈奕迅', '邓紫棋', '夜曲', '晴天', '孤勇者', '七里香', 'Lofi', 'Jazz']

async function renderDiscover () {
  return renderLibraryView()
}

/* 歌单页：我的歌单 + 推荐歌单 */
async function renderLibraryView () {
  state.view = 'playlist'
  setViewTitle('歌单', state.playlists.length + ' 个')
  $$('.rail-item').forEach((b) => b.classList.toggle('active', b.dataset.view === 'playlist'))
  $$('.pl-item').forEach((b) => b.classList.remove('active'))
  const box = $('#panelList')

  const rows = state.playlists.map((p) => {
    const first = p.songs[0]
    const cov = first ? coverUrl(first) : ''
    const thumb = cov
      ? `<img class="coll-thumb" src="${esc(cov)}" onerror="this.style.visibility='hidden'" />`
      : `<span class="coll-thumb ph">${svg('i-music')}</span>`
    const sub = p.songs.length + ' 首' + (first ? ' · ' + esc(first.name) : '')
    return `<div class="coll-row" data-id="${p.id}">
      ${thumb}
      <div class="coll-info"><div class="coll-name">${esc(p.name)}</div><div class="coll-sub">${sub}</div></div>
      ${svg('i-chevron')}
    </div>`
  }).join('')

  box.innerHTML = `
    <div class="queue-head">
      <span>我的歌单</span>
      <span class="head-actions">
        <button class="btn-mini" id="btnNewPlaylist2">${svg('i-plus')}新建</button>
        <button class="btn-mini solid" id="btnImportPlaylist">${svg('i-download')}导入</button>
      </span>
    </div>
    <div class="coll-list">${rows || '<div class="empty">没有歌单</div>'}</div>`

  $('#btnNewPlaylist2').onclick = () => newPlaylist()
  $('#btnImportPlaylist').onclick = () => openImport()
  box.querySelectorAll('.coll-row').forEach((row) => {
    const pl = state.playlists.find((p) => p.id === row.dataset.id)
    row.onclick = () => renderPlaylistView(pl.id)
    row.oncontextmenu = (e) => {
      e.preventDefault()
      showContextMenu(e.clientX, e.clientY, [
        { icon: 'i-music', label: '打开', onClick: () => renderPlaylistView(pl.id) },
        { icon: 'i-plus', label: '重命名', onClick: () => renamePlaylist(pl) },
        { sep: true },
        { icon: 'i-trash', label: '删除', danger: true, onClick: () => deletePlaylist(pl) },
      ])
    }
  })
}

/* 推荐歌单页 */
function renderRecommendView () {
  state.view = 'recommend'
  setViewTitle('推荐歌单', PLATFORM_NAME[state.platform])
  $$('.rail-item').forEach((b) => b.classList.toggle('active', b.dataset.view === 'recommend'))
  $$('.pl-item').forEach((b) => b.classList.remove('active'))
  const box = $('#panelList')
  box.innerHTML = `<div class="rec-grid" id="recGrid">${'<div class="rec-card"><div class="rec-cover sk"></div></div>'.repeat(10)}</div>`
  loadRecPage(true)
}

/* 推荐歌单操作弹窗 */
let pendingRec = null
function openRecDialog (ds) {
  pendingRec = { platform: ds.platform, id: ds.id }
  $('#recDialogCover').src = ds.cover || ''
  $('#recDialogName').textContent = ds.name || ''
  $('#recDialogMeta').textContent = (Number(ds.count) || 0) + ' 首 · ' + fmtCount(ds.play) + ' 播放'
  $('#overlayRec').classList.add('show')
}

/* 预览推荐歌单（不导入，先看歌） */
function playlistUrlOf (platform, id) {
  if (platform === 'kg') return 'https://www.kugou.com/yy/special/single/' + id + '.html'
  if (platform === 'tx') return 'https://y.qq.com/n/ryqq/playlist/' + id
  return 'https://music.163.com/#/playlist?id=' + id
}

let previewCtx = null

async function previewRecPlaylist (platform, id) {
  navPush({ view: 'preview', platform, id })
  previewCtx = { platform, id }
  state.view = 'preview'
  $$('.rail-item').forEach((b) => b.classList.toggle('active', b.dataset.view === 'recommend'))
  setViewTitle('加载中…', PLATFORM_NAME[platform] || '')
  const box = $('#panelList')
  box.innerHTML = skeletonList()
  $('#mainActions').innerHTML = ''
  try {
    const d = await api('/api/playlist', { method: 'POST', body: { action: 'preview', url: playlistUrlOf(platform, id) } })
    if (!previewCtx || previewCtx.id !== id) return
    renderPreview(d.preview || {}, d.songs || [], platform, id)
  } catch (e) {
    box.innerHTML = `<div class="empty">${svg('i-music')}<b>加载失败</b>${esc(e.message)}</div>`
  }
}

function renderPreview (meta, songs, platform, id) {
  state.view = 'preview'
  setViewTitle(meta.name || '歌单预览', (meta.count || songs.length) + ' 首 · ' + (PLATFORM_NAME[platform] || '') + ' · 预览')
  const box = $('#panelList')
  $('#mainActions').innerHTML = `
    <button class="btn-mini solid" id="btnPreviewImport">${svg('i-download')}导入到我的歌单</button>`
  const imp = $('#btnPreviewImport')
  if (imp) imp.onclick = () => importFromCard(platform, id)
  if (!songs.length) { box.innerHTML = '<div class="empty">该歌单没有歌曲</div>'; return }
  box.innerHTML = `<table class="song-list"><tbody>${songs.map((s, i) => songRow(s, i)).join('')}</tbody></table>`
  bindListEvents(songs, box)
}

async function renderDiscoverLegacy () {
  setViewTitle('发现', PLATFORM_NAME[state.platform])
  const box = $('#panelList')
  box.innerHTML = `
    <div class="sh-chips" style="margin:0 0 16px">${HOT_WORDS.map((w) => `<span class="sh-chip" data-kw="${esc(w)}">${esc(w)}</span>`).join('')}</div>
    <div class="queue-head"><span>推荐歌单</span><span id="recCount"></span></div>
    <div class="rec-grid" id="recGrid">${'<div class="rec-card"><div class="rec-cover sk"></div></div>'.repeat(6)}</div>
    <div class="queue-head" style="margin-top:18px"><span>新歌</span></div>
    <div id="newList">${skeletonList()}</div>`

  box.querySelectorAll('.sh-chip').forEach((c) => {
    c.onclick = () => {
      $('#searchInput').value = c.dataset.kw
      $('.search-wrap').classList.add('has-value')
      doSearch()
    }
  })

  try {
    const cached = discoverCache[state.platform]
    if (cached) {
      renderRecPlaylists(cached.playlists || [])
      renderNewSongs(cached.newSongs || [])
    }
    const d = await api('/api/discover?source=' + state.platform)
    discoverCache[state.platform] = d
    if (state.view !== 'search' || !$('#recGrid')) return
    renderRecPlaylists(d.playlists || [])
    renderNewSongs(d.newSongs || [])
  } catch (e) {
    if (!$('#recGrid')) return
    if (!discoverCache[state.platform]) {
      $('#recGrid').innerHTML = `<div class="empty">${esc(e.message)}</div>`
      $('#newList').innerHTML = ''
    }
  }
}

const discoverCache = {}

function fmtCount (n) {
  n = Number(n) || 0
  if (n >= 1e8) return (n / 1e8).toFixed(1) + '亿'
  if (n >= 1e4) return Math.round(n / 1e4) + '万'
  return String(n)
}

const recState = { list: [], offset: 0, loading: false, done: false, platform: '' }
let recCooldown = 0

function recCardHtml (p) {
  return `<div class="rec-card" data-id="${esc(p.id)}" data-platform="${esc(p.platform || 'wy')}"
      data-name="${esc(p.name)}" data-cover="${esc(p.cover)}" data-count="${Number(p.count) || 0}" data-play="${Number(p.playCount) || 0}"
      title="${esc(p.name)}">
      <div class="rec-cover">
        <img src="${esc(p.cover)}" loading="lazy" onerror="this.style.visibility='hidden'" />
        <span class="rec-play">${fmtCount(p.playCount)}</span>
      </div>
      <div class="rec-name">${esc(p.name)}</div>
    </div>`
}

function renderRecGrid () {
  const grid = $('#recGrid')
  if (!grid) return
  const cnt = $('#recCount')
  if (cnt) cnt.textContent = recState.list.length
  if (!recState.list.length && recState.done) {
    grid.innerHTML = '<div class="empty" style="grid-column:1/-1;padding:20px 0">暂无推荐</div>'
    return
  }
  grid.innerHTML = recState.list.map(recCardHtml).join('') +
    (recState.done
      ? '<div class="rec-end">已经到底了</div>'
      : `<div class="rec-more" id="btnMoreRec">${recState.loading ? '加载中…' : '下滑加载更多'}</div>`)
  grid.querySelectorAll('.rec-card').forEach((c) => {
    c.onclick = () => previewRecPlaylist(c.dataset.platform, c.dataset.id)
  })
  const more = $('#btnMoreRec')
  if (more) more.onclick = () => loadRecPage(false)
}

async function loadRecPage (reset) {
  const grid = $('#recGrid')
  if (!grid) return
  if (reset) {
    recState.list = []
    recState.offset = 0
    recState.done = false
    recState.loading = false
    recState.platform = state.platform
  }
  if (recState.loading || recState.done) return
  recState.loading = true
  renderRecGrid()
  try {
    const d = await api('/api/discover?source=' + recState.platform + '&offset=' + recState.offset + '&limit=30')
    if (recState.platform !== state.platform) return
    const list = (d.playlists || []).filter((p) => !recState.list.some((x) => x.id === p.id))
    recState.list = recState.list.concat(list)
    recState.offset += 30
    if (list.length < 30) recState.done = true
  } catch (e) {
    if (!recState.list.length) grid.innerHTML = `<div class="empty" style="grid-column:1/-1">${esc(e.message)}</div>`
    recState.done = true
  } finally {
    recState.loading = false
    recCooldown = Date.now() + 600
    renderRecGrid()
  }
}

function renderRecPlaylists (list) {
  recState.list = list
  recState.done = true
  renderRecGrid()
}

function renderNewSongs (list) {
  const box = $('#newList')
  if (!box) return
  const head = box.previousElementSibling
  if (!list.length) {
    if (head && head.classList.contains('queue-head')) head.style.display = 'none'
    box.innerHTML = ''
    return
  }
  if (head && head.classList.contains('queue-head')) head.style.display = ''
  box.innerHTML = `<table class="song-list"><tbody>${list.map((s, i) => songRow(s, i)).join('')}</tbody></table>`
  bindListEvents(list, box)
}

async function importFromCard (platform, id) {
  const url = platform === 'kg'
    ? 'https://www.kugou.com/yy/special/single/' + id + '.html'
    : platform === 'tx'
      ? 'https://y.qq.com/n/ryqq/playlist/' + id
      : 'https://music.163.com/#/playlist?id=' + id
  toast('正在导入歌单…', 1600)
  try {
    const d = await api('/api/playlist', { method: 'POST', body: { action: 'import', url } })
    state.playlists = d.playlists
    renderRailPlaylists()
    renderPlaylistView(d.imported.id)
    const sk = d.imported.skipped || 0
    toast('已导入：' + d.imported.name + '（' + d.imported.count + ' 首）' +
      (sk ? '，跳过 ' + sk + ' 首已下架/无版权' : ''), sk ? 4200 : 3000)
  } catch (e) {
    toast('导入失败：' + e.message, 3600)
  }
}

/* ================= 榜单 ================= */
async function renderLeaderboard () {
  state.view = 'leaderboard'
  setViewTitle('排行榜', PLATFORM_NAME[state.platform])
  const tabs = RANK_TABS[state.platform] || RANK_TABS.wy
  if (!tabs.find((t) => t[0] === state.leaderboardType)) state.leaderboardType = tabs[0][0]
  const box = $('#panelList')
  box.innerHTML = `
    <div class="queue-head"><span>排行榜</span><span>${PLATFORM_NAME[state.platform]}</span></div>
    <div class="sh-chips" style="margin:0 2px 12px">${tabs.map(([k, n]) => `<span class="sh-chip ${state.leaderboardType === k ? 'active' : ''}" data-t="${k}" style="${state.leaderboardType === k ? 'border-color:var(--brass);color:var(--brass)' : ''}">${n}</span>`).join('')}</div>
    <div id="leaderBody">${skeletonList()}</div>`
  box.querySelectorAll('.sh-chip').forEach((b) => { b.onclick = () => { state.leaderboardType = b.dataset.t; renderLeaderboard() } })
  try {
    const data = await api('/api/toplist?type=' + state.leaderboardType + '&source=' + state.platform)
    state.results = data.list || []
    $('#leaderBody').innerHTML = `<div class="queue-head"><span>${esc(data.name || '')}</span><span>${data.list.length}</span></div>
      <table class="song-list"><tbody>${data.list.map((s, i) => songRow(s, i)).join('')}</tbody></table>`
    bindListEvents(data.list, $('#leaderBody'))
  } catch (e) {
    $('#leaderBody').innerHTML = `<div class="empty">${svg('i-fire')}<b>加载失败</b>${esc(e.message)}</div>`
  }
}

/* ================= 歌曲行 ================= */
function songRow (song, i) {
  const playing = state.currentSong && String(state.currentSong.id) === String(song.id) && (song.source || 'wy') === (state.currentSong.source || 'wy')
  return `<tr data-id="${esc(song.id)}" data-source="${esc(song.source || 'wy')}" class="${playing ? 'playing' : ''}">
    <td class="s-idx">
      ${playing ? `<span class="eq ${state.playing ? '' : 'paused'}"><i></i><i></i><i></i></span>` : `<span class="idx-num">${i + 1}</span>`}
      <span class="idx-play">${svg('i-play')}</span>
    </td>
    <td class="s-col-song"><div class="s-song">
      <img class="s-cover" loading="lazy" src="${esc(coverUrl(song))}" onerror="this.style.visibility='hidden'" />
      <div><div class="s-title" title="${esc(song.name)}">${esc(song.name)}${song.fee === 1 || song.fee === 4 ? '<span class="s-tag">VIP</span>' : ''}</div>
      <div class="s-singer">${esc(song.singer)}</div></div>
    </div></td>
    <td class="s-col-time s-time">${esc(song.durationText || '')}</td>
    <td class="s-col-ops s-ops">
      <button class="op-btn" data-act="play" title="播放">${svg('i-play')}</button>
      <button class="op-btn" data-act="like" title="收藏">${svg('i-heart')}</button>
    </td>
  </tr>`
}

function findSong (list, id, source) {
  return list.find((s) => String(s.id) === String(id) && (s.source || 'wy') === (source || 'wy')) || list.find((s) => String(s.id) === String(id))
}

function bindListEvents (list, root, opts = {}) {
  const scope = root || $('#panelList')
  scope.querySelectorAll('.song-list tbody tr').forEach((tr) => {
    const song = findSong(list, tr.dataset.id, tr.dataset.source)
    if (!song) return
    tr.addEventListener('click', (e) => {
      if (e.target.closest('.op-btn')) return
      if (state.currentSong && String(state.currentSong.id) === String(song.id)) togglePlay()
      else playSong(song, list)
    })
    tr.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      showSongMenu(e.clientX, e.clientY, song, list, opts)
    })
    /* 触屏：长按 500ms 打开同一份菜单 */
    let holdT = null
    tr.addEventListener('touchstart', (e) => {
      const t = e.touches[0]
      holdT = setTimeout(() => {
        if (navigator.vibrate) navigator.vibrate(12)
        showSongMenu(t.clientX, t.clientY, song, list, opts)
      }, 500)
    }, { passive: true })
    tr.addEventListener('touchmove', () => clearTimeout(holdT), { passive: true })
    tr.addEventListener('touchend', () => clearTimeout(holdT))
    tr.querySelectorAll('.op-btn').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation()
        const act = b.dataset.act
        if (act === 'play') playSong(song, list)
        if (act === 'like') addToPlaylist(song, 'default', true)
      })
    })
  })
}

/* ================= 最近播放 ================= */
function renderRecentView () {
  state.view = 'recent'
  setViewTitle('最近播放', state.recent.length + ' 首')
  const box = $('#panelList')
  if (!state.recent.length) {
    box.innerHTML = `<div class="queue-head"><span>最近播放</span></div>
      <div class="empty">${svg('i-clock')}<b>暂无记录</b>播放过的歌会出现在这里</div>`
    return
  }
  box.innerHTML = `<table class="song-list"><tbody>${state.recent.map((s, i) => songRow(s, i)).join('')}</tbody></table>`
  bindListEvents(state.recent, box)
}

/* ================= 歌单 ================= */
async function loadPlaylists () {
  const data = await api('/api/db')
  state.playlists = data.playlists
  if (!state.currentPlaylist) state.currentPlaylist = state.playlists[0] && state.playlists[0].id
  renderRailPlaylists()
}

function renderRailPlaylists () {
  const box = $('#plList')
  box.innerHTML = state.playlists.map((p) => {
    const first = p.songs[0]
    const cov = first ? coverUrl(first) : ''
    const thumb = cov
      ? `<img class="pl-cover" src="${esc(cov)}" onerror="this.style.visibility='hidden'" />`
      : `<span class="pl-cover-ph">${svg('i-music')}</span>`
    return `<div class="pl-item ${state.view === 'playlist' && state.currentPlaylist === p.id ? 'active' : ''}" data-id="${p.id}" title="${esc(p.name)}">
      ${thumb}<span>${esc(p.name)}</span><small>${p.songs.length}</small>
    </div>`
  }).join('')
  box.querySelectorAll('.pl-item').forEach((el) => {
    el.onclick = () => { state.currentPlaylist = el.dataset.id; switchView('playlist') }
    el.oncontextmenu = (e) => {
      e.preventDefault()
      const pl = state.playlists.find((p) => p.id === el.dataset.id)
      showContextMenu(e.clientX, e.clientY, [
        { icon: 'i-music', label: '打开', onClick: () => { state.currentPlaylist = pl.id; switchView('playlist') } },
        { icon: 'i-plus', label: '重命名', onClick: () => renamePlaylist(pl) },
        { sep: true },
        { icon: 'i-trash', label: '删除歌单', danger: true, onClick: () => deletePlaylist(pl) },
      ])
    }
  })
}

async function renderPlaylistView (id) {
  const pl = state.playlists.find((p) => p.id === id) || state.playlists[0]
  if (!pl) return
  navPush({ view: 'playlistDetail', id: pl.id })
  setViewTitle(pl.name, pl.songs.length + ' 首')
  state.currentPlaylist = pl.id
  state.view = 'playlist'
  renderRailPlaylists()
  $$('.rail-item').forEach((b) => b.classList.toggle('active', b.dataset.view === 'playlist'))
  const box = $('#panelList')
  if (!pl.songs.length) {
    box.innerHTML = `<div class="queue-head"><span><button class="link-btn" id="backToColl">‹ 歌单</button> ${esc(pl.name)}</span><span>0</span></div>
      <div class="empty">空歌单</div>`
    const back = $('#backToColl')
    if (back) back.onclick = () => renderLibraryView()
    return
  }
  box.innerHTML = `<div class="queue-head"><span><button class="link-btn" id="backToColl">‹ 歌单</button> ${esc(pl.name)}</span><span>${pl.songs.length}</span></div>
    <table class="song-list"><tbody>${pl.songs.map((s, i) => songRow(s, i)).join('')}</tbody></table>`
  const back = $('#backToColl')
  if (back) back.onclick = () => renderLibraryView()
  bindListEvents(pl.songs, box, { playlistId: pl.id })
}

/* 歌单总览 */
function renderCollectionsView () {
  setViewTitle('歌单', state.playlists.length + ' 个')
  state.view = 'playlist'
  $$('.rail-item').forEach((b) => b.classList.toggle('active', b.dataset.view === 'playlist'))
  $$('.pl-item').forEach((b) => b.classList.remove('active'))
  const box = $('#panelList')
  const rows = state.playlists.map((p) => {
    const first = p.songs[0]
    const cov = first ? coverUrl(first) : ''
    const thumb = cov
      ? `<img class="coll-thumb" src="${esc(cov)}" onerror="this.style.visibility='hidden'" />`
      : `<span class="coll-thumb ph">${svg('i-music')}</span>`
    const extra = p.platform ? ' · ' + (PLATFORM_NAME[p.platform] || p.platform) : ''
    const firstSong = first ? ' · ' + esc(first.name) : ''
    return `<div class="coll-row" data-id="${p.id}">
      ${thumb}
      <div class="coll-info">
        <div class="coll-name">${esc(p.name)}</div>
        <div class="coll-sub">${p.songs.length} 首${firstSong || extra}</div>
      </div>
      ${svg('i-chevron')}
    </div>`
  }).join('')
  box.innerHTML = `
    <div class="queue-head">
      <span>全部 · ${state.playlists.length}</span>
      <span class="head-actions">
        <button class="btn-mini" id="btnNewPlaylist2">${svg('i-plus')}新建</button>
        <button class="btn-mini solid" id="btnImportPlaylist">${svg('i-download')}导入</button>
      </span>
    </div>
    <div class="coll-list">${rows || '<div class="empty">没有歌单</div>'}</div>`
  $('#btnNewPlaylist2').onclick = () => newPlaylist()
  $('#btnImportPlaylist').onclick = () => openImport()
  box.querySelectorAll('.coll-row').forEach((row) => {
    const pl = state.playlists.find((p) => p.id === row.dataset.id)
    row.onclick = () => renderPlaylistView(pl.id)
    row.oncontextmenu = (e) => {
      e.preventDefault()
      showContextMenu(e.clientX, e.clientY, [
        { icon: 'i-music', label: '打开', onClick: () => renderPlaylistView(pl.id) },
        { icon: 'i-plus', label: '重命名', onClick: () => renamePlaylist(pl) },
        { sep: true },
        { icon: 'i-trash', label: '删除', danger: true, onClick: () => deletePlaylist(pl) },
      ])
    }
  })
}

async function newPlaylist () {
  const name = prompt('新歌单名称', '新歌单')
  if (!name) return
  const data = await api('/api/playlist', { method: 'POST', body: { action: 'create', name } })
  state.playlists = data.playlists
  renderRailPlaylists()
  toast('已创建：' + name)
}

/* 导入歌单 */
function openImport () {
  const box = $('#overlayImport')
  box.classList.add('show')
  const st = $('#importStatus')
  st.textContent = ''
  st.className = 'import-status'
  setTimeout(() => $('#importPlaylistUrl').focus(), 80)
}

async function doImportPlaylist () {
  const url = $('#importPlaylistUrl').value.trim()
  const st = $('#importStatus')
  const btn = $('#btnDoImport')
  if (!url) {
    st.className = 'import-status err'
    st.textContent = '请粘贴歌单链接或 ID'
    return
  }
  st.className = 'import-status'
  st.textContent = '正在导入…'
  btn.disabled = true
  try {
    const d = await api('/api/playlist', { method: 'POST', body: { action: 'import', url } })
    state.playlists = d.playlists
    renderRailPlaylists()
    st.textContent = '已导入「' + d.imported.name + '」' + d.imported.count + ' 首'
    toast('导入成功：' + d.imported.name)
    $('#overlayImport').classList.remove('show')
    $('#importPlaylistUrl').value = ''
    renderPlaylistView(d.imported.id)
  } catch (e) {
    st.className = 'import-status err'
    st.textContent = '导入失败：' + e.message
  } finally {
    btn.disabled = false
  }
}
async function renamePlaylist (pl) {
  const name = prompt('重命名歌单', pl.name)
  if (!name || name === pl.name) return
  const data = await api('/api/playlist', { method: 'POST', body: { action: 'rename', id: pl.id, name } })
  state.playlists = data.playlists
  renderRailPlaylists()
  if (state.view === 'playlist') renderPlaylistView(pl.id)
}
async function deletePlaylist (pl) {
  if (!confirm(`确定删除歌单「${pl.name}」？`)) return
  const data = await api('/api/playlist', { method: 'POST', body: { action: 'delete', id: pl.id } })
  state.playlists = data.playlists
  state.currentPlaylist = state.playlists[0] && state.playlists[0].id
  renderRailPlaylists()
  switchView('playlist')
  toast('歌单已删除')
}
async function addToPlaylist (song, listId, tip) {
  try {
    const data = await api('/api/playlist', { method: 'POST', body: { action: 'add', listId, song } })
    state.playlists = data.playlists
    renderRailPlaylists()
    if (tip) {
      const pl = state.playlists.find((p) => p.id === listId)
      toast('已收藏到「' + (pl ? pl.name : '歌单') + '」')
    }
  } catch (e) { toast(e.message) }
}
async function removeFromPlaylist (listId, song) {
  const data = await api('/api/playlist', { method: 'POST', body: { action: 'remove', listId, id: song.id } })
  state.playlists = data.playlists
  renderRailPlaylists()
  if (state.view === 'playlist') renderPlaylistView(listId)
  toast('已从歌单移除')
}

/* ================= 面板 tab ================= */
/* ================= 播放队列抽屉 ================= */
function toggleQueue (force) {
  const d = $('#queueDrawer')
  if (!d) return
  const show = typeof force === 'boolean' ? force : !d.classList.contains('show')
  d.classList.toggle('show', show)
  if (show) renderQueue()
}

/* ================= 队列 ================= */
function renderQueue () {
  const list = $('#queueList')
  if (!list) return
  $('#qCount').textContent = state.queue.length
  if (!state.queue.length) { list.innerHTML = '<div class="empty" style="padding:26px 0">队列是空的</div>'; return }
  list.innerHTML = state.queue.map((s, i) => `
    <div class="q-item ${i === state.index ? 'active' : ''}" data-i="${i}" draggable="true">
      <span class="q-grip">${svg('i-grip')}</span>
      <span class="q-idx">${i === state.index ? svg('i-play') : i + 1}</span>
      <div class="q-meta"><div class="q-name">${esc(s.name)}</div><div class="q-singer">${esc(s.singer)}</div></div>
      <button class="q-del" data-i="${i}" title="移出">${svg('i-close')}</button>
    </div>`).join('')
  list.querySelectorAll('.q-item').forEach((el) => {
    const i = Number(el.dataset.i)
    el.onclick = (e) => { if (!e.target.closest('.q-del')) playAt(i) }
    el.addEventListener('dragstart', () => { state.dragIndex = i; el.style.opacity = '.4' })
    el.addEventListener('dragend', () => { el.style.opacity = ''; list.querySelectorAll('.q-item').forEach((x) => x.classList.remove('drag-over')) })
    el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drag-over') })
    el.addEventListener('dragleave', () => el.classList.remove('drag-over'))
    el.addEventListener('drop', (e) => { e.preventDefault(); el.classList.remove('drag-over'); moveQueueItem(state.dragIndex, i) })

    /* 触屏：长按 350ms 后上下滑动排序 */
    let startY = 0
    let dragFrom = -1
    let holdTimer = null
    el.addEventListener('touchstart', (e) => {
      const t = e.touches[0]
      startY = t.clientY
      dragFrom = -1
      holdTimer = setTimeout(() => {
        dragFrom = i
        el.classList.add('dragging')
        if (navigator.vibrate) navigator.vibrate(12)
      }, 350)
    }, { passive: true })
    el.addEventListener('touchmove', (e) => {
      if (dragFrom < 0) return
      e.preventDefault()
    }, { passive: false })
    el.addEventListener('touchend', (e) => {
      clearTimeout(holdTimer)
      el.classList.remove('dragging')
      if (dragFrom < 0) return
      const dy = e.changedTouches[0].clientY - startY
      const rowH = el.offsetHeight || 44
      const target = Math.max(0, Math.min(state.queue.length - 1, dragFrom + Math.round(dy / rowH)))
      if (target !== dragFrom) moveQueueItem(dragFrom, target)
      dragFrom = -1
    })
  })
  list.querySelectorAll('.q-del').forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation()
      const i = Number(b.dataset.i)
      const playing = i === state.index
      state.queue.splice(i, 1)
      if (i < state.index) state.index--
      else if (playing) state.index = Math.min(i, state.queue.length - 1)
      renderQueue(); saveQueue()
    }
  })
}

function moveQueueItem (from, to) {
  if (from < 0 || to < 0 || from === to || from >= state.queue.length) return
  const [item] = state.queue.splice(from, 1)
  state.queue.splice(to, 0, item)
  if (from === state.index) state.index = to
  else if (from < state.index && to >= state.index) state.index--
  else if (from > state.index && to <= state.index) state.index++
  renderQueue(); saveQueue()
}

/* ================= 右键菜单 ================= */
function showContextMenu (x, y, items) {
  const menu = $('#ctxMenu')
  menu.innerHTML = items.map((it, i) => it.sep
    ? '<div class="ctx-sep"></div>'
    : `<div class="ctx-item ${it.danger ? 'danger' : ''}" data-i="${i}">${svg(it.icon || 'i-music')}<span>${esc(it.label)}</span></div>`
  ).join('')
  menu.classList.add('show')
  const rect = menu.getBoundingClientRect()
  menu.style.left = Math.min(x, window.innerWidth - rect.width - 8) + 'px'
  menu.style.top = Math.min(y, window.innerHeight - rect.height - 8) + 'px'
  menu.querySelectorAll('.ctx-item').forEach((el) => {
    el.onclick = () => {
      const it = items[Number(el.dataset.i)]
      hideContextMenu()
      it && it.onClick && it.onClick()
    }
  })
}
function hideContextMenu () { $('#ctxMenu').classList.remove('show') }

function showSongMenu (x, y, song, list, opts = {}) {
  const items = [
    { icon: 'i-play', label: '播放', onClick: () => playSong(song, list) },
    { icon: 'i-next', label: '下一首播放', onClick: () => playNextSong(song) },
    { icon: 'i-list', label: '加入队列', onClick: () => { state.queue.push(song); renderQueue(); saveQueue(); toast('已加入队列') } },
    { sep: true },
    { icon: 'i-heart', label: '收藏到默认歌单', onClick: () => addToPlaylist(song, 'default', true) },
    { icon: 'i-plus', label: '收藏到新歌单…', onClick: async () => {
      const name = prompt('新歌单名称', song.name.slice(0, 12))
      if (!name) return
      const d = await api('/api/playlist', { method: 'POST', body: { action: 'create', name } })
      state.playlists = d.playlists
      await addToPlaylist(song, d.id, true)
      renderRailPlaylists()
    } },
  ]
  if (opts.playlistId) items.push({ sep: true }, { icon: 'i-trash', label: '从当前歌单移除', danger: true, onClick: () => removeFromPlaylist(opts.playlistId, song) })
  items.push({ sep: true }, { icon: 'i-download', label: '下载', onClick: () => downloadSong(song) })

  const plat = song.source || 'wy'
  const cands = state.sources.filter((s) => s.status === 'ok' && s.enabled && (s.sources || []).includes(plat)).slice(0, 4)
  if (cands.length > 1) {
    items.push({ sep: true })
    cands.forEach((s) => {
      items.push({ icon: 'i-src', label: '用「' + s.name + '」取流', onClick: () => startSong(song, s.id) })
    })
  }
  items.push({ sep: true }, { icon: 'i-flag', label: '复制歌曲信息', onClick: () => {
    const text = `${song.name} - ${song.singer}` + (song.album ? `（${song.album}）` : '')
    navigator.clipboard.writeText(text).then(() => toast('已复制：' + text)).catch(() => toast('复制失败'))
  } })
  showContextMenu(x, y, items)
}

/* ================= 音源面板 ================= */
async function loadSources () {
  try {
    const data = await api('/api/sources')
    state.sources = data.list
    const st = $('#srcStatus') || { textContent: '', style: {}, classList: { add () {}, remove () {}, toggle () {} }, value: '', addEventListener () {} }
    if (st) {
      const ok = data.list.filter((s) => s.status === 'ok' && s.enabled)
      st.textContent = '音源 ' + ok.length + '/' + data.list.length
    }
  } catch (e) {}
}

async function renderSourcesPane () {
  await loadSources()
  const body = $('#sourcesBody')
  body.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center">
      <button class="btn-ghost" id="btnReloadAll">重新加载全部</button>
      <button class="btn-ghost" id="btnSpeedTest">测速当前歌曲</button>
      <input id="importUrl" class="src-url-input" placeholder="音源脚本地址（.js）" />
      <button class="btn-ghost" id="btnImportUrl">在线导入</button>
    </div>
    <div id="speedResult" style="display:none;margin-bottom:14px"></div>
    <div class="grid">${state.sources.map((s) => `
      <div class="card ${s.enabled ? '' : 'disabled'}" data-id="${s.id}">
        <div class="card-head"><div class="card-title">${esc(s.name)}</div>
          <span class="badge ${s.status === 'ok' ? 'ok' : 'err'}">${s.status === 'ok' ? '正常' : '异常'}</span></div>
        <div class="card-desc">${esc(s.description || '（无描述）')}${s.version ? ' · v' + esc(s.version) : ''}</div>
        <div class="chips">${(s.sources || []).map((x) => `<span class="chip hl">${esc(x)}</span>`).join('') || '<span class="chip">无平台</span>'}</div>
        ${s.error ? `<div class="card-desc" style="color:#e08276">${esc(s.error)}</div>` : ''}
        <div class="card-ops">
          <button class="btn-ghost" data-act="toggle">${s.enabled ? '停用' : '启用'}</button>
          <button class="btn-ghost" data-act="reload">重载</button>
          <button class="btn-ghost" data-act="logs">日志</button>
          <button class="btn-ghost btn-danger" data-act="remove">删除</button>
        </div>
        <div class="logs" style="display:none">${esc((s.logs || []).map((l) => l.line).join('\n') || '（无日志）')}</div>
      </div>`).join('')}</div>
    <div class="hint">脚本目录：sources/</div>`

  $('#btnReloadAll').onclick = async () => {
    body.innerHTML = `<div class="empty">${svg('i-refresh')}<b>重新加载音源…</b>需要 20~60 秒</div>`
    await api('/api/sources/reload', { method: 'POST', body: {} })
    await renderSourcesPane()
    toast('已重新加载')
  }
  $('#btnImportUrl').onclick = async () => {
    const url = $('#importUrl').value.trim()
    if (!url) return toast('请填写地址')
    toast('正在导入…')
    try {
      const name = (url.split('/').pop() || 'imported').replace(/\.js.*$/i, '')
      await api('/api/sources/import', { method: 'POST', body: { name, url } })
      await renderSourcesPane()
      toast('导入完成')
    } catch (e) { toast('导入失败：' + e.message, 4000) }
  }
  $('#btnSpeedTest').onclick = async () => {
    const song = state.currentSong || (state.results && state.results[0])
    if (!song) return toast('先搜一首歌再测速')
    const box = $('#speedResult')
    box.style.display = 'block'
    box.innerHTML = `<div class="card"><div class="card-title">正在测速「${esc(song.name)}」…</div></div>`
    try {
      const data = await api('/api/sources/test?' + songParams(song).toString())
      const list = data.list || []
      const max = Math.max(...list.map((x) => x.ms || 1), 1)
      box.innerHTML = `<div class="card"><div class="card-head"><div class="card-title">测速结果</div><span class="badge">${esc(data.source)}</span></div>
        ${list.map((x) => `<div class="speed-row"><span class="badge ${x.ok ? 'ok' : 'err'}" style="width:44px;text-align:center">${x.ok ? '可用' : '失败'}</span>
        <span style="width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.name)}</span>
        <div class="speed-bar"><i style="width:${x.ok ? Math.max(6, Math.min(100, (1 - x.ms / max) * 100)) : 0}%"></i></div>
        <span class="speed-ms">${x.ms}ms</span></div>`).join('')}</div>`
    } catch (e) {
      box.innerHTML = `<div class="card"><div class="card-title" style="color:#e08276">测速失败：${esc(e.message)}</div></div>`
    }
  }

  body.querySelectorAll('.card').forEach((card) => {
    const id = card.dataset.id
    card.querySelectorAll('.btn-ghost').forEach((b) => {
      b.onclick = async () => {
        const act = b.dataset.act
        if (act === 'logs') { const l = card.querySelector('.logs'); l.style.display = l.style.display === 'none' ? 'block' : 'none' }
        if (act === 'toggle') {
          const s = state.sources.find((x) => x.id === id)
          await api('/api/sources/toggle', { method: 'POST', body: { id, enabled: !s.enabled } })
          renderSourcesPane()
        }
        if (act === 'reload') {
          b.textContent = '重载中…'
          try { await api('/api/sources/reload', { method: 'POST', body: { id } }) } catch (e) { toast(e.message) }
          renderSourcesPane()
        }
        if (act === 'remove') {
          if (!confirm('删除该音源脚本？')) return
          await api('/api/sources/remove', { method: 'POST', body: { id } })
          renderSourcesPane()
        }
      }
    })
  })
}

/* ================= 设置面板 ================= */
function renderSettingsPane () {
  const body = $('#settingsBody')
  const dl = state.downloads.slice(0, 6)
  const sleepTxt = state.sleepAt ? ('剩余 ' + Math.max(0, Math.round((state.sleepAt - Date.now()) / 60000)) + ' 分钟') : '未开启'
  body.innerHTML = `
    <div class="card" style="max-width:640px">
      <div class="form-row"><label>默认音质</label>
        <select id="setQuality">
          <option value="128k">标准 128K</option><option value="320k">较高 320K</option>
          <option value="flac">无损 FLAC</option><option value="flac24bit">Hi-Res 24bit</option>
        </select></div>
      <div class="form-row"><label>手机访问</label><span class="lan-url" id="lanUrl">检测中…</span></div>
      <div class="form-row"><label>QQ 音乐 Cookie</label>
        <div style="display:flex;gap:8px;flex:1;min-width:0">
          <input id="qqCookie" class="text-input" style="flex:1;min-width:0" placeholder="QQ 歌单加载失败时填写：浏览器登录 y.qq.com 后复制 Cookie" />
          <button class="btn-mini" id="qqCookieSave">保存</button>
        </div></div>
      <div class="form-row"><label>下载格式</label>
        <div class="theme-dots">
          <button class="mode-btn dl-fmt" data-fmt="mp3">MP3 320K</button>
          <button class="mode-btn dl-fmt" data-fmt="flac">FLAC 无损</button>
        </div></div>
      <div class="form-row"><label>下载目录</label>
        <div style="display:flex;gap:8px;flex:1;min-width:0">
          <input id="dlDir" class="text-input" style="flex:1;min-width:0" placeholder="留空使用 音乐\留声" />
          <button class="btn-mini" id="dlDirSave">保存</button>
          <button class="btn-mini" id="dlDirPick">选择</button>
        </div></div>
      <div class="form-row"><label>跟随封面取色</label><input id="setCoverTheme" type="checkbox" ${state.themeFromCover ? 'checked' : ''} /></div>
      <div class="form-row"><label>外观</label>
        <div class="theme-dots">
          <button class="mode-btn" data-mode="light">亮色</button>
          <button class="mode-btn" data-mode="warm">暖白</button>
          <button class="mode-btn" data-mode="dark">暗色</button>
        </div></div>
      <div class="form-row"><label>配色</label>
        <div class="theme-dots">${[['#1f9d55', '绿'], ['#d0483c', '红'], ['#2f6fe0', '蓝'], ['#8b5cf6', '紫'], ['#c8a061', '黄铜']].map(([c, n]) => `<span class="theme-dot" data-color="${c}" style="background:${c}" title="${n}"></span>`).join('')}</div></div>
      <div class="form-row"><label>睡眠定时（${sleepTxt}）</label>
        <div style="display:flex;gap:6px">
          <button class="btn-ghost" data-sleep="15">15</button>
          <button class="btn-ghost" data-sleep="30">30</button>
          <button class="btn-ghost" data-sleep="60">60</button>
          <button class="btn-ghost" data-sleep="0">取消</button>
        </div></div>
      <div class="form-row"><label>桌面歌词</label><button class="btn-ghost" id="setDesktop">打开独立窗口</button></div>
      <div class="form-row"><label>清空本地数据</label><button class="btn-ghost btn-danger" id="btnResetData">清空歌单与缓存</button></div>
    </div>
    <h2 style="font-family:var(--serif);font-size:14px;margin:18px 0 8px">最近下载</h2>
    <div class="card" style="max-width:640px">
      ${dl.length ? dl.map((d) => `<div class="dl-row"><span>${esc(d.name)}</span><span style="color:var(--text-3)">${esc(d.singer)}</span><span class="chip">${esc(d.quality)}</span></div>`).join('') : '<div class="card-desc">暂无记录</div>'}
    </div>
    <div class="hint">快捷键：空格 播放 · ← → 快进 · Shift+← → 切歌 · L 歌词 · M 静音 · Ctrl K 搜索</div>`

  $('#setQuality').value = state.quality
  $('#setQuality').onchange = (e) => {
    state.quality = e.target.value
    $('#qualitySelect').value = state.quality
    saveSettings()
  }
  $('#setCoverTheme').onchange = (e) => {
    state.themeFromCover = e.target.checked
    saveSettings()
    if (state.themeFromCover && state.currentSong) pickThemeFromCover(state.currentSong)
  }
  $$('.theme-dot').forEach((d) => { d.onclick = () => setTheme(d.dataset.color) })

  /* QQ 音乐 Cookie：QQ 歌单需要登录才能读取 */
  if ($('#qqCookieSave')) {
    api('/api/settings').then((s) => {
      const inp = $('#qqCookie')
      if (inp && s && s.qqCookie) inp.value = s.qqCookie
    }).catch(() => {})
    $('#qqCookieSave').onclick = async () => {
      const v = ($('#qqCookie').value || '').trim()
      try {
        await api('/api/settings', { method: 'POST', body: { qqCookie: v } })
        toast(v ? 'QQ Cookie 已保存，可以加载 QQ 歌单了' : 'QQ Cookie 已清空', 2600)
      } catch (e) { toast('保存失败：' + e.message, 2600) }
    }
  }
  if ($('#dlDirSave')) {
    api('/api/download-dir').then((r) => {
      const inp = $('#dlDir')
      if (inp) inp.value = r.dir || ''
      if (inp) inp.placeholder = r.default || ''
    }).catch(() => {})
    $('#dlDirSave').onclick = async () => {
      const v = ($('#dlDir').value || '').trim()
      try {
        const r = await api('/api/download-dir?set=' + encodeURIComponent(v))
        $('#dlDir').value = r.dir
        if (r && r.writable === false) toast('已设为：' + r.dir + '（当前进程写不进去，重启程序后一般正常）', 4200)
        else toast('下载目录已设为：' + r.dir, 2600)
      } catch (e) { toast('设置失败：' + e.message, 2600) }
    }
/* 选择目录：桌面壳弹系统文件夹选择框；浏览器里退回 $showDirectoryPicker$ */
    if ($('#dlDirPick')) {
      $('#dlDirPick').onclick = async () => {
        try {
          if (window.chrome && window.chrome.webview && window.chrome.webview.postMessage) {
            window.chrome.webview.postMessage('pickDir')
            toast('请在弹窗里选择下载目录…', 4000)
            return
          }
          /* 浏览器环境：只能用 File System Access API，拿不到真实路径则提示手填 */
          if (window.showDirectoryPicker) {
            const handle = await window.showDirectoryPicker()
            toast('浏览器无法获取真实路径，请手动填写：当前选择 ' + (handle && handle.name), 5000)
            return
          }
          toast('当前环境不支持目录选择，请手动填写路径', 3000)
        } catch (e) { }
      }
    }
    if (window.chrome && window.chrome.webview && window.chrome.webview.addEventListener) {
      window.chrome.webview.addEventListener('message', (ev) => {
        const data = String(ev.data || '')
        if (data.startsWith('openDirFail:')) {
          const p2 = data.slice('openDirFail:'.length)
          toast('系统不允许自动打开文件夹，路径已复制：' + p2, 5000)
          try { navigator.clipboard.writeText(p2) } catch (e) { }
          return
        }
        if (!data.startsWith('dirPicked:')) return
        const dir = data.slice('dirPicked:'.length)
        const inp = $('#dlDir')
        if (inp) inp.value = dir
        api('/api/download-dir?set=' + encodeURIComponent(dir)).then((r) => {
          if (r && r.writable === false) toast('已设为：' + dir + '（当前进程写不进去，重启程序后一般正常）', 4200)
          else toast('下载目录已设为：' + dir, 3000)
        }).catch((e) => toast('设置失败：' + e.message, 3000))
      })
    }
  }
}

function setSleep (minutes, rerender) {
  if (state.sleepTimer) { clearTimeout(state.sleepTimer); state.sleepTimer = null }
  if (!minutes) { state.sleepAt = 0; toast('已取消睡眠定时', 1400) }
  else {
    state.sleepAt = Date.now() + minutes * 60e3
    state.sleepTimer = setTimeout(() => {
      audio.pause(); state.sleepAt = 0
      toast('睡眠定时到，已暂停', 4000)
    }, minutes * 60e3)
    toast(minutes + ' 分钟后暂停', 1800)
  }
  if (rerender) renderSettingsPane()
}

/* ================= 快捷键 ================= */
function onHotkey (e) {
  const tag = (e.target.tagName || '').toLowerCase()
  const typing = tag === 'input' || tag === 'textarea' || tag === 'select'
  if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'f')) {
    e.preventDefault(); $('#searchInput').focus(); $('#searchInput').select(); return
  }
  if (typing) return
  if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); navGo(-1); return }
  if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); navGo(1); return }
  if (e.code === 'Space') { e.preventDefault(); togglePlay() }
  else if (e.key === 'ArrowRight') { e.preventDefault(); if (e.shiftKey) playNext(false); else if (audio.duration) audio.currentTime = Math.min(audio.duration, audio.currentTime + 5) }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); if (e.shiftKey) playPrev(); else if (audio.duration) audio.currentTime = Math.max(0, audio.currentTime - 5) }
  else if (e.key === 'Escape') {
    $('#lyricLayer').classList.remove('show')
    $$('.overlay').forEach((o) => o.classList.remove('show'))
    hideContextMenu()
  } else if (e.key === 'l' || e.key === 'L') $('#lyricLayer').classList.toggle('show')
  else if (e.key === 'm' || e.key === 'M') toggleMute()
}

/* ================= 视图切换 ================= */
function switchView (name) {
  navPush({ view: name, keyword: name === 'search' ? state.keyword : undefined })
  state.view = name
  /* 清空预览页留下的操作按钮，避免常驻 */
  const acts = $('#mainActions')
  if (acts) acts.innerHTML = ''
  $$('.mtab').forEach((x) => x.classList.toggle('active', x.dataset.mview === name))
  document.body.classList.remove('m-deck')
  $$('.rail-item').forEach((b) => b.classList.toggle('active', b.dataset.view === name))
  $$('.pl-item').forEach((b) => b.classList.remove('active'))
  const act = {
    search: () => renderLibraryView(),
    playlist: () => renderLibraryView(),
    recommend: () => renderRecommendView(),
    recent: () => renderRecentView(),
    leaderboard: () => renderLeaderboard(),
    downloads: () => renderDownloadsView(),
  }[name]
  act && act()
}

/* ================= 下载管理 ================= */
async function renderDownloadsView () {
  setViewTitle('下载管理', '')
  const box = $('#panelList')
  if (!box) return
  box.innerHTML = '<div class="empty-hint">正在读取下载目录…</div>'
  let data = null
  try {
    data = await api('/api/downloads')
  } catch (e) {
    box.innerHTML = '<div class="empty-hint">读取失败：' + e.message + '</div>'
    return
  }
  const files = (data && data.files) || []
  const dir = (data && data.dir) || ''
  const head = `<div class="dl-bar">
      <span class="dl-dir" title="${(data && data.dirs ? data.dirs.join(' | ') : dir)}">${data && data.dirs && data.dirs.length > 1 ? data.dirs.length + ' 个目录' : (dir || '未设置目录')}</span>
      <button class="btn-mini" id="dlCopyDir">复制路径</button>
      <button class="btn-mini" id="dlRefresh">刷新</button>
    </div>`
  if (!files.length) {
    box.innerHTML = head + '<div class="empty-hint">还没有下载的文件</div>'
  } else {
    const rows = files.map((f, i) => `<tr data-name="${encodeURIComponent(f.name)}" data-dir="${encodeURIComponent(f.dir || '')}">
        <td class="idx">${i + 1}</td>
        <td class="c-name">${f.name}<div class="c-dir">${f.dir || ''}</div></td>
        <td class="c-size">${(f.size / 1048576).toFixed(1)} MB</td>
        <td class="c-time">${new Date(f.mtime).toLocaleString('zh-CN', { hour12: false })}</td>
        <td class="c-act">
          <button class="icon-btn dl-remove" title="删除">✕</button>
        </td>
      </tr>`).join('')
    box.innerHTML = head + `<table class="song-list dl-list"><thead><tr>
        <th style="width:48px">#</th><th>文件</th><th style="width:90px">大小</th>
        <th style="width:170px">时间</th><th style="width:60px"></th>
      </tr></thead><tbody>${rows}</tbody></table>`
  }

  $$('.dl-fmt').forEach((b) => {
    b.classList.toggle('active', b.dataset.fmt === state.dlFormat)
    b.onclick = () => {
      state.dlFormat = b.dataset.fmt
      $$('.dl-fmt').forEach((x) => x.classList.toggle('active', x === b))
      saveSettings()
      toast('下载格式：' + (state.dlFormat === 'flac' ? 'FLAC 无损' : 'MP3 320K'), 1600)
    }
  })
  if ($('#dlCopyDir')) {
    $('#dlCopyDir').onclick = async () => {
      let ok = false
      try { await navigator.clipboard.writeText(dir); ok = true } catch (e) { }
      if (!ok) {
        try {
          const ta = document.createElement('textarea')
          ta.value = dir
          document.body.appendChild(ta)
          ta.select()
          document.execCommand('copy')
          ta.remove()
          ok = true
        } catch (e) { }
      }
      toast(ok ? '路径已复制，粘贴到资源管理器地址栏即可打开' : '复制失败，手动记下：' + dir, 4200)
    }
  }
  if ($('#dlRefresh')) $('#dlRefresh').onclick = () => renderDownloadsView()
  $$('.dl-list tbody tr').forEach((tr) => {
    tr.title = '点击打开文件所在文件夹'
    tr.onclick = async (e) => {
      if (e.target.closest('.dl-remove')) return
      const name = decodeURIComponent(tr.dataset.name)
      const dir = decodeURIComponent(tr.dataset.dir || '')
      /* 优先让桌面外壳打开（它有完整系统权限） */
      if (window.chrome && window.chrome.webview && window.chrome.webview.postMessage) {
        window.chrome.webview.postMessage('openDir:' + dir)
        toast('正在打开文件夹：' + dir, 2200)
        return
      }
      try {
        const r = await api('/api/downloads/reveal?name=' + encodeURIComponent(name) + '&dir=' + encodeURIComponent(dir))
        if (r && r.ok) { toast('已打开文件夹', 1600); return }
        try { await navigator.clipboard.writeText((r && r.path) || name) } catch (er) { }
        toast('打不开文件夹，路径已复制：' + ((r && r.path) || name), 4200)
      } catch (err) {
        toast('打开失败：' + err.message, 2600)
      }
    }
  })
  $$('.dl-remove').forEach((b) => {
    b.onclick = async (e) => {
      e.stopPropagation()
      const tr = b.closest('tr')
      const name = decodeURIComponent(tr.dataset.name)
      if (!confirm('删除「' + name + '」？')) return
      try {
        await api('/api/downloads/remove?name=' + encodeURIComponent(name))
        toast('已删除', 1600)
        renderDownloadsView()
      } catch (err) { toast('删除失败：' + err.message, 2600) }
    }
  })
}

/* ================= 启动 ================= */
boot()

/* 移动端：注册 Service Worker（可添加到主屏，像 App 一样全屏运行） */
if ('serviceWorker' in navigator && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
