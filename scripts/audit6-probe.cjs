'use strict'
/* Round-6 audit: fake-DOM runtime probe (read-only; does not modify source) */
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ROOT = path.resolve(__dirname, '..')
const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8')
const appSrc = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8')
const P = (s) => console.log(s)

/* ---------------- fake DOM ---------------- */
const byId = new Map()
const allEls = []
const intervals = []
const dynIds = new Set()
{
  const re = /\bid="([^"$<>{}]+)"/g
  let m
  while ((m = re.exec(appSrc))) dynIds.add(m[1])
}

class Cls {
  constructor () { this.s = new Set() }
  add (...c) { for (const x of c) if (x) this.s.add(x) }
  remove (...c) { for (const x of c) this.s.delete(x) }
  toggle (c, on) { if (on === undefined) this.s.has(c) ? this.s.delete(c) : this.s.add(c); else if (on) this.s.add(c); else this.s.delete(c) }
  contains (c) { return this.s.has(c) }
}

function mkEl (tag, id) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(),
    id: id || '',
    dataset: {}, style: { setProperty () {}, removeProperty () {}, getPropertyValue: () => '' },
    children: [], parentNode: null, _html: '', _text: '', _value: '', _attrs: {},
    options: [], selectedIndex: 0, disabled: false, onclick: null, onchange: null,
    offsetTop: 10, offsetHeight: 20, clientHeight: 120, clientWidth: 300, offsetWidth: 300,
    scrollTop: 0, scrollHeight: 500, className: '', title: '',
  }
  el.classList = new Cls()
  Object.defineProperty(el, 'innerHTML', { get () { return this._html }, set (v) { this._html = String(v) } })
  Object.defineProperty(el, 'textContent', { get () { return this._text }, set (v) { this._text = String(v) } })
  Object.defineProperty(el, 'value', { get () { return this._value }, set (v) { this._value = v } })
  el.appendChild = (c) => { el.children.push(c); if (c) c.parentNode = el; return c }
  el.insertBefore = (c) => { el.children.push(c); if (c) c.parentNode = el; return c }
  el.removeChild = (c) => { el.children = el.children.filter((x) => x !== c); return c }
  el.remove = () => { if (el.parentNode) el.parentNode.removeChild(el) }
  el.setAttribute = (k, v) => { el._attrs[k] = v }
  el.getAttribute = (k) => el._attrs[k]
  el.removeAttribute = (k) => { delete el._attrs[k] }
  el.addEventListener = () => {}
  el.removeEventListener = () => {}
  el.dispatchEvent = () => {}
  el.getBoundingClientRect = () => ({ top: 0, left: 0, width: 200, height: 3, right: 200, bottom: 3 })
  el.scrollTo = () => {}
  el.focus = () => {}
  el.select = () => {}
  el.closest = (s) => (matchesSel(el, s) ? el : null)
  el.querySelector = (s) => q1(s, el) || mkEl('div')
  el.querySelectorAll = (s) => qa(s, el)
  allEls.push(el)
  if (id) byId.set(id, el)
  return el
}

function matchesSimple (el, t) {
  if (t[0] === '#') return el.id === t.slice(1)
  if (t[0] === '.') return el.classList.contains(t.slice(1))
  if (t[0] === '[') {
    const raw = t.slice(1, -1)
    const [k, v] = raw.split('=')
    const key = k.replace(/^data-/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase())
    if (el.dataset[key] === undefined) return false
    if (v === undefined) return true
    return String(el.dataset[key]) === v.replace(/^["']|["']$/g, '')
  }
  return el.tagName === t.toUpperCase()
}
function matchesSel (el, sel) {
  const parts = sel.trim().split(/\s+/).filter(Boolean)
  let cur = el
  for (let i = parts.length - 1; i >= 0; i--) {
    const t = parts[i].replace(/^>/, '')
    if (!cur || !matchesSimple(cur, t)) return false
    if (i > 0) cur = cur.parentNode
  }
  return true
}
function scopeAll (root) {
  if (!root || root === document) return allEls.slice()
  const out = [root]
  const walk = (n) => { for (const c of n.children || []) { out.push(c); walk(c) } }
  walk(root)
  return out
}
function q1 (sel, root) {
  if (sel[0] === '#' && !/\s/.test(sel)) {
    const id = sel.slice(1)
    if (byId.has(id)) return byId.get(id)
    if (dynIds.has(id)) { const e = mkEl('div', id); byId.set(id, e); return e }
    return null
  }
  return scopeAll(root).find((e) => matchesSel(e, sel)) || null
}
function qa (sel, root) {
  if (sel[0] === '#' && !/\s/.test(sel)) { const e = q1(sel, root); return e ? [e] : [] }
  return scopeAll(root).filter((e) => matchesSel(e, sel))
}

const document = {
  documentElement: mkEl('html'), body: mkEl('body'),
  querySelector: (s) => q1(s), querySelectorAll: (s) => qa(s),
  createElement: (t) => mkEl(t), getElementById: (id) => q1('#' + id),
  addEventListener: () => {}, createTextNode: (t) => ({ textContent: t }), execCommand: () => true,
}

{
  const re = /<(\w+)([^>]*?)\bid="([^"]+)"([^>]*)>/g
  let m
  while ((m = re.exec(html))) {
    const attrs = m[2] + ' ' + m[4]
    const el = mkEl(m[1], m[3])
    const cls = /class="([^"]*)"/.exec(attrs)
    if (cls) cls[1].split(/\s+/).filter(Boolean).forEach((c) => el.classList.add(c))
    const dv = /data-([\w-]+)="([^"]*)"/g
    let d
    while ((d = dv.exec(attrs))) el.dataset[d[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = d[2]
    document.body.appendChild(el)
  }
  const mkCls = (spec) => { const e = mkEl('button'); Object.assign(e.dataset, spec.data || {}); (spec.cls || []).forEach((c) => e.classList.add(c)); document.body.appendChild(e); return e }
  mkCls({ cls: ['rail-item'], data: { view: 'playlist' } })
  mkCls({ cls: ['rail-item'], data: { view: 'recommend' } })
  mkCls({ cls: ['rail-item'], data: { view: 'leaderboard' } })
  mkCls({ cls: ['rail-item'], data: { view: 'recent' } })
  mkCls({ cls: ['rail-item'], data: { view: 'downloads' } })
  mkCls({ cls: ['mtab'], data: { mview: 'playlist' } })
  mkCls({ cls: ['mtab'], data: { mview: 'now' } })
  ;['overlaySources', 'overlaySettings', 'overlayImport', 'overlayRec'].forEach((id) => { const e = byId.get(id); if (e) e.classList.add('overlay') })
}

const audioEl = byId.get('audio') || mkEl('audio', 'audio')
Object.assign(audioEl, {
  paused: true, duration: 240, currentTime: 0, volume: 1, muted: false, playbackRate: 1, src: '',
  play: () => Promise.resolve(), pause: () => {}, load: () => {},
})
byId.set('audio', audioEl)

/* ---------------- fake host ---------------- */
const calls = []
const responders = []
const S = (i) => ({ id: String(i), source: 'wy', name: 'song' + i, singer: 'singer' + i, cover: '', durationText: '03:30' })
/* boot() runs at load time, so default responders must be registered first */
responders.push({ test: (u) => u.startsWith('/api/db'), data: { playlists: [{ id: 'default', name: 'Default', songs: [S(1), S(2)] }] } })
responders.push({ test: (u) => u === '/api/sources', data: { list: [{ id: 'a', name: 'A', status: 'ok', enabled: true, sources: ['wy'] }, { id: 'b', name: 'B', status: 'ok', enabled: true, sources: ['wy'] }] } })
responders.push({ test: (u) => u.startsWith('/api/discover'), data: { playlists: [], newSongs: [] } })
responders.push({ test: (u) => u.startsWith('/api/settings'), data: { qqCookieSet: true, qqCookieTail: 'abc123' } })
responders.push({ test: (u) => u.startsWith('/api/download-dir'), data: { dir: 'C:\\Music', default: 'C:\\Music2' } })
responders.push({ test: (u) => u.startsWith('/api/stream'), data: {} })
responders.push({ test: (u) => u.startsWith('/api/url?'), delay: 40, data: { url: 'http://x/a.mp3', provider: 'p', quality: '320k' } })
responders.push({ test: (u) => u.startsWith('/api/lyric'), data: { lyric: '[00:01.00]la', tlyric: '' } })
responders.push({ test: (u) => u.startsWith('/api/toplist'), delay: 60, data: { name: 'Top', list: [S(21)] } })
responders.push({ test: (u) => u.startsWith('/api/downloads'), data: { dir: 'C:\\Music', dirs: ['C:\\Music'], files: [] } })

function fakeFetch (url) {
  const u = String(url)
  calls.push(u)
  const r = responders.find((f) => f.test(u))
  const body = r ? r.data : {}
  const delay = r && r.delay ? r.delay : 0
  return new Promise((res, rej) => setTimeout(() => {
    if (r && r.error) return rej(new Error(r.error))
    if (r && r.badJson) return res({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <') }, text: async () => '<html>' })
    res({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) })
  }, delay))
}

const win = {}
win.window = win
win.document = document
win.console = { log: () => {}, warn: () => {}, error: () => {} }
win.navigator = { userAgent: 'node', clipboard: { writeText: () => Promise.resolve() } }
win.localStorage = { _m: {}, getItem (k) { return this._m[k] === undefined ? null : this._m[k] }, setItem (k, v) { this._m[k] = String(v) }, removeItem (k) { delete this._m[k] }, clear () { this._m = {} } }
win.getComputedStyle = () => ({ getPropertyValue: () => '#1f9d55', position: 'static' })
win.URLSearchParams = URLSearchParams
win.AbortController = undefined
win.Image = function () { return { onload: null, src: '' } }
win.BroadcastChannel = undefined
win.confirm = () => false
win.prompt = () => 'newlist'
win.open = () => ({})
win.location = { href: '', reload () {} }
win.innerWidth = 1440
win.innerHeight = 900
win.setTimeout = (f, ms) => setTimeout(f, ms)
win.setInterval = (f, ms) => { const t = setInterval(f, ms); intervals.push(t); return t }
win.clearTimeout = clearTimeout
win.clearInterval = clearInterval
win.fetch = fakeFetch
win.addEventListener = () => {}
win.Event = class { constructor (t) { this.type = t } }
win.performance = { now: () => Date.now() }

const ctx = vm.createContext(win)
ctx.document = document
ctx.audio = audioEl
ctx.fetch = fakeFetch
ctx.window = ctx

const EXPORTS = `
globalThis.__X = {
  state, boot, bindEvents, doSearch, switchView, renderDownloadsView, renderSettingsPane,
  renderSourcesPane, doImportPlaylist, renderLeaderboard, renderSearchResults, newPlaylist,
  playSong, startSong, renderQueue, renderLibraryView, enhanceSelect, api, loadRecPage,
  renderRecGrid, checkPreviewAndSwitch, reloadCurrent, downloadSong, renderRecommendView,
  previewRecPlaylist, toast, saveQueue, setVolume, updateSpeedBtn
}
`
try {
  vm.runInContext(appSrc + '\n' + EXPORTS, ctx, { filename: 'app.js' })
  P('[1] app.js toplevel executed OK (boot() ran inside)')
} catch (e) {
  P('[1] FAIL toplevel threw: ' + (e && e.message))
  process.exit(1)
}
const X = ctx.__X
const state = X.state
const tick = (ms) => new Promise((r) => setTimeout(r, ms))

;(async () => {
  await tick(60)
  /* ---- 2 ---- */
  try { X.bindEvents(); P('[2] bindEvents() OK against real index.html ids (no null deref)') } catch (e) { P('[2] FAIL bindEvents threw: ' + e.message) }

  /* ---- 3 ---- */
  const bootIntervals = intervals.length
  const before = intervals.length
  const sels = allEls.filter((e) => e.tagName === 'SELECT')
  sels.forEach((s) => X.enhanceSelect(s))
  P('[3] intervals live after boot = ' + bootIntervals + ' (selects=' + sels.length + '), second enhanceSelect pass added = ' +
    (intervals.length - before) + ', clearInterval in app.js: ' + (appSrc.match(/clearInterval/g) ? 'yes' : 'none'))
  P('[3b] #btnRecImport.onclick === null after boot: ' + (byId.get('btnRecImport').onclick === null) + ' (openRecDialog is never called anywhere)')

  /* ---- 4 race: late search response over a switched view ---- */
  responders.push({ test: (u) => u.startsWith('/api/search'), delay: 120, data: { list: [S(11), S(12)], total: 2 } })
  byId.get('searchInput').value = 'jay'
  const pSearch = X.doSearch()
  await tick(10)
  const pTop = X.renderLeaderboard()
  await tick(20)
  P('[4] during in-flight search, switched to leaderboard: state.view=' + state.view)
  await pSearch
  await tick(5)
  const panel = byId.get('panelList').innerHTML
  P('[4] after search resolves: panelList has song table=' + /song-list/.test(panel) + ', state.view=' + state.view +
    ', #viewTitle="' + byId.get('viewTitle').textContent + '"')
  await pTop

  /* ---- 4b stale error overwrites newer results (catch has no seq guard) ---- */
  responders.unshift({
    test: (u) => u.includes('kw=bad'),
    delay: 100,
    error: 'boom',
  })
  byId.get('searchInput').value = 'bad'
  const pBad = X.doSearch()
  await tick(5)
  const rOk = responders.find((r) => r.test('/api/search'))
  const savedDelay = rOk.delay
  rOk.delay = 0
  byId.get('searchInput').value = 'good'
  const pGood = X.doSearch()
  await pGood
  const afterGood = byId.get('panelList').innerHTML
  await pBad
  await tick(5)
  const afterBad = byId.get('panelList').innerHTML
  P('[4b] good search rendered table=' + /song-list/.test(afterGood) + '; after stale "bad" error lands: table present=' +
    /song-list/.test(afterBad) + ', panel now="' + afterBad.replace(/\s+/g, ' ').slice(0, 90) + '"')
  rOk.delay = savedDelay

  /* ---- 5 unescaped download file names ---- */
  const evil = 'x</td><img src=x onerror=alert(1)>.mp3'
  const r5 = responders.find((r) => r.test('/api/downloads'))
  r5.data = { dir: 'C:\\Music" onmouseover="alert(2)', dirs: ['C:\\Music'], files: [{ name: evil, dir: 'C:\\Music" x="y', size: 1048576, mtime: Date.now() }] }
  await X.renderDownloadsView()
  const dl = byId.get('panelList').innerHTML
  P('[5] downloads innerHTML contains raw payload=' + dl.includes('<img src=x onerror=alert(1)>') +
    ', title attr broken by quote=' + /title="C:\\Music" onmouseover="/.test(dl))

  /* ---- 6 duplicate import ---- */
  responders.push({ test: (u) => u === '/api/playlist', delay: 40, data: { playlists: [{ id: 'p9', name: 'Imported', songs: [] }], imported: { id: 'p9', name: 'Imported', count: 1 } } })
  byId.get('importPlaylistUrl').value = 'https://music.163.com/#/playlist?id=1'
  const n0 = calls.filter((u) => u === '/api/playlist').length
  await Promise.all([X.doImportPlaylist(), X.doImportPlaylist()])
  const n1 = calls.filter((u) => u === '/api/playlist').length
  P('[6] two concurrent doImportPlaylist() -> POST /api/playlist count = ' + (n1 - n0))

  /* ---- 7 settings pane bindings ---- */
  X.renderSettingsPane()
  await tick(40)
  const cu = byId.get('btnCheckUpdate')
  const rd = byId.get('btnResetData')
  const sd = byId.get('setDesktop')
  const sq = byId.get('setQuality')
  P('[7] after renderSettingsPane: btnCheckUpdate=' + typeof (cu && cu.onclick) + ' btnResetData=' + typeof (rd && rd.onclick) +
    ' setDesktop=' + typeof (sd && sd.onclick) + ' setQuality.value="' + (sq && sq.value) + '"')

  /* ---- 8 sources pane bindings ---- */
  await X.renderSourcesPane()
  P('[8] after renderSourcesPane: btnReloadAll=' + typeof byId.get('btnReloadAll').onclick +
    ' btnImportUrl=' + typeof byId.get('btnImportUrl').onclick + ' btnSpeedTest=' + typeof byId.get('btnSpeedTest').onclick)

  /* ---- 9 duplicate startSong ---- */
  const c0 = calls.filter((u) => u.startsWith('/api/url?') || u.startsWith('/api/lyric')).length
  const s1 = S(31)
  X.playSong(s1, [s1])
  X.playSong(s1, [s1])
  await tick(250)
  const c1 = calls.filter((u) => u.startsWith('/api/url?') || u.startsWith('/api/lyric')).length
  P('[9] double-click same song -> /api/url + /api/lyric calls = ' + (c1 - c0))

  /* ---- 10 malformed 200 response from /api/db ---- */
  const dbR = responders.find((r) => r.test('/api/db'))
  dbR.badJson = true
  let bootErr = ''
  try { await X.boot() } catch (e) { bootErr = e && e.message }
  await tick(30)
  let rerr = ''
  try { await X.renderLibraryView() } catch (e) { rerr = e && e.message }
  P('[10] /api/db 返回 200 但 body 不是 JSON → state.playlists = ' + String(state.playlists) +
    ' ; boot() 没有 reject（"' + bootErr + '"）；但 renderLibraryView() 自己 reject："' + rerr + '"（async 函数，不会进 boot 的 catch，只会变成 unhandledrejection）')
  dbR.badJson = false

  P('')
  intervals.forEach(clearInterval)
  process.exit(0)
})().catch((e) => { P('PROBE CRASH: ' + (e && e.stack ? e.stack.split('\n').slice(0, 5).join(' | ') : e)); process.exit(1) })