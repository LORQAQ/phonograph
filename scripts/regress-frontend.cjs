'use strict'
/**
 * 前端逻辑实测 —— 在假 DOM 里真正加载 app.js 并调用关键函数
 * 不依赖浏览器，纯 Node 环境
 */
const path = require('node:path')
const fs = require('node:fs')
const vm = require('node:vm')

process.chdir(path.resolve(__dirname, '..'))

let pass = 0
let fail = 0
const failures = []
function ok (n, e) { pass++; console.log('  ✓ ' + n + (e ? '  ' + e : '')) }
function bad (n, d) { fail++; failures.push(n + (d ? '  — ' + d : '')); console.log('  ✗ ' + n + (d ? '  ' + d : '')) }

/* ---------- 构造一个够用的假 DOM ---------- */
function makeEl (tag, id) {
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    id: id || '',
    className: '',
    _html: '',
    _text: '',
    dataset: {},
    style: { setProperty () { }, removeProperty () { } },
    children: [],
    parentNode: null,
    classList: {
      _s: new Set(),
      add (...c) { c.forEach((x) => this._s.add(x)) },
      remove (...c) { c.forEach((x) => this._s.delete(x)) },
      toggle (c, on) { if (on === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c) } else { on ? this._s.add(c) : this._s.delete(c) } },
      contains (c) { return this._s.has(c) },
    },
    get innerHTML () { return this._html },
    set innerHTML (v) { this._html = String(v) },
    get textContent () { return this._text },
    set textContent (v) { this._text = String(v) },
    get value () { return this._value === undefined ? '' : this._value },
    set value (v) { this._value = v },
    appendChild (c) { this.children.push(c); c.parentNode = this; return c },
    insertBefore (c, ref) { this.children.push(c); c.parentNode = this; return c },
    removeChild (c) { this.children = this.children.filter((x) => x !== c); return c },
    setAttribute (k, v) { this[k] = v },
    getAttribute (k) { return this[k] },
    removeAttribute (k) { delete this[k] },
    addEventListener () { },
    removeEventListener () { },
    querySelector () { return null },
    querySelectorAll () { return [] },
    getBoundingClientRect () { return { top: 0, left: 0, width: 100, height: 20, bottom: 20, right: 100 } },
    scrollTo () { },
    focus () { },
    click () { if (this.onclick) this.onclick({ target: this }) },
    closest () { return null },
    remove () { },
    offsetTop: 0,
    clientHeight: 100,
    offsetHeight: 20,
    getElementsByTagName () { return [] },
    options: [],
    selectedIndex: 0,
  }
  return el
}

/* 预置的 id → 元素（设置面板需要的那批） */
const WANTED_IDS = [
  'importUrl', 'dlDirInput', 'dlDirSave', 'dlDirPick', 'setDesktop', 'btnResetData',
  'qualitySelect', 'setQuality', 'searchInput', 'btnSearch', 'btnLoadMore',
  'npName', 'npSinger', 'npTitle', 'npArtist', 'coverImg', 'npCover', 'lyricCover', 'lyricBg',
  'lyricInner', 'lyricRoll', 'lyricScroll', 'lyricName', 'lyricSinger', 'lyricPlay',
  'srcBadge', 'volNum', 'totalTime', 'curTime', 'progress', 'progressBar',
  'vinyl', 'tonearm', 'disc', 'btnPlay', 'panelList', 'settingsBody', 'overlaySettings',
  'queueList', 'playlistList', 'sourcesBody', 'downloadsBody', 'btnRefreshDl',
  'qqCookieInput', 'btnSaveQQCookie', 'btnClearQQCookie',
]

const registry = new Map()
for (const id of WANTED_IDS) registry.set(id, makeEl('div', id))

/* 几个类选择器的虚拟集合 */
const classSets = {
  '.dl-fmt': [Object.assign(makeEl('button'), { dataset: { fmt: 'mp3' } }), Object.assign(makeEl('button'), { dataset: { fmt: 'flac' } })],
  '[data-mode]': [makeEl('button'), makeEl('button'), makeEl('button')],
  '[data-sleep]': [makeEl('button'), makeEl('button'), makeEl('button'), makeEl('button')],
  '.theme-dot': [makeEl('div'), makeEl('div'), makeEl('div')],
  '.mode-btn': [makeEl('button'), makeEl('button'), makeEl('button')],
  '.rail-item': [makeEl('button'), makeEl('button')],
  '.mtab': [makeEl('button'), makeEl('button')],
  '.overlay': [],
  '[data-close]': [],
  'select': [],
  '.song-list tbody tr': [],
  '.dd-panel .dd-item': [],
  '.tab': [],
  '.fmt-btn': [],
  '.q-btn': [],
  '.pl-item': [],
  '.src-card': [],
  '.dl-item': [],
  '.rec-card': [],
  '.top-item': [],
  '.recent-item': [],
}

const body = makeEl('body')
const doc = {
  documentElement: makeEl('html'),
  body,
  readyState: 'complete',
  getElementById (id) { return registry.get(id) || null },
  querySelector (sel) {
    if (sel.startsWith('#')) return registry.get(sel.slice(1)) || null
    if (classSets[sel]) return classSets[sel][0] || null
    /* 形如 '#a .b' 的复合选择器 */
    const m = sel.match(/^#([\w-]+)/)
    if (m) return registry.get(m[1]) || null
    return null
  },
  querySelectorAll (sel) {
    if (sel.startsWith('#')) {
      const e = registry.get(sel.slice(1))
      return e ? [e] : []
    }
    if (classSets[sel]) return classSets[sel]
    const m = sel.match(/^#([\w-]+)/)
    if (m) {
      const e = registry.get(m[1])
      return e ? [e] : []
    }
    return []
  },
  createElement (tag) { return makeEl(tag) },
  createTextNode (t) { const e = makeEl('#text'); e._text = t; return e },
  addEventListener () { },
  removeEventListener () { },
  head: makeEl('head'),
  cookie: '',
}

const localStorageMap = new Map()
const localStorage = {
  getItem (k) { return localStorageMap.has(k) ? localStorageMap.get(k) : null },
  setItem (k, v) { localStorageMap.set(k, String(v)) },
  removeItem (k) { localStorageMap.delete(k) },
  clear () { localStorageMap.clear() },
  get length () { return localStorageMap.size },
  key (i) { return Array.from(localStorageMap.keys())[i] },
}

const audioEl = makeEl('audio')
audioEl.play = () => Promise.resolve()
audioEl.pause = () => { }
audioEl.load = () => { }
audioEl.currentTime = 0
audioEl.duration = 200
audioEl.volume = 0.8
audioEl.muted = false
audioEl.src = ''

/* ---------- 组装 sandbox ---------- */
const sandbox = {
  console,
  document: doc,
  localStorage,
  navigator: { userAgent: 'audit4-test', language: 'zh-CN' },
  location: { href: 'http://127.0.0.1:37621/', origin: 'http://127.0.0.1:37621', reload () { }, hash: '', search: '' },
  setTimeout, clearTimeout, setInterval, clearInterval,
  queueMicrotask,
  Promise, Map, Set, WeakMap, WeakSet, JSON, Math, Date, Number, String, Boolean, Array, Object, RegExp, Error,
  parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
  fetch: () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}), text: () => Promise.resolve('') }),
  requestAnimationFrame: (fn) => setTimeout(fn, 16),
  cancelAnimationFrame: clearTimeout,
  getComputedStyle: () => ({ position: 'relative', getPropertyValue: () => '' }),
  matchMedia: () => ({ matches: false, addEventListener () { }, addListener () { } }),
  alert: () => { },
  confirm: () => true,
  prompt: () => '',
  Audio: function () { return makeEl('audio') },
  Image: function () { return makeEl('img') },
  URL: URL,
  URLSearchParams: URLSearchParams,
  AbortController: AbortController,
  crypto: require('node:crypto').webcrypto,
  performance: { now: () => Date.now() },
}
sandbox.window = sandbox
sandbox.globalThis = sandbox
sandbox.self = sandbox

/* audio 元素通过 querySelector('#audio') / getElementById 拿到 */
registry.set('audio', audioEl)
classSets['audio'] = [audioEl]

vm.createContext(sandbox)

/* ---------- 加载 app.js ---------- */
console.log('========== 前端逻辑实测 ==========\n')
console.log('【1】加载 app.js')
const code = fs.readFileSync('public/app.js', 'utf8')
let loadErr = null
try {
  vm.runInContext(code, sandbox, { filename: 'app.js', timeout: 15000 })
  ok('脚本加载无异常')
} catch (e) {
  loadErr = e
  bad('脚本加载', e.message)
}
if (loadErr) {
  console.log('\n加载失败，后续测试跳过')
  process.exit(1)
}

/* ---------- 检查暴露到全局的符号 ---------- */
console.log('\n【2】关键符号')

/* app.js 是 IIFE 还是全局？试探性检查 */
const names = Object.keys(sandbox).filter((k) => !['console', 'document', 'localStorage', 'navigator', 'location', 'window', 'globalThis', 'self'].includes(k))
console.log('  sandbox 新增全局: ' + names.slice(0, 20).join(', ') + (names.length > 20 ? ' …' : ''))

/* 用 eval 在 sandbox 里探测函数是否存在（函数声明会挂到全局） */
function hasFn (name) {
  try {
    const r = vm.runInContext('typeof ' + name, sandbox)
    return r === 'function'
  } catch (e) { return false }
}
function hasVar (name) {
  try {
    const r = vm.runInContext('typeof ' + name, sandbox)
    return r !== 'undefined'
  } catch (e) { return false }
}

const fns = ['renderSettingsPane', 'renderNowPlaying', 'reloadCurrent', 'startSong', 'doSearch',
  'paintProgress', 'setSrc', 'updatePlayButton', 'renderDownloadsView', 'saveQueue',
  'setQuality', 'setThemeMode', 'setSleep', 'esc', 'streamSrc']
for (const f of fns) {
  hasFn(f) ? ok('函数 ' + f) : bad('函数 ' + f, '未定义')
}

/* state 对象 */
hasVar('state') ? ok('state 存在') : bad('state', '未定义')
if (hasVar('state')) {
  const lq = vm.runInContext("typeof state.lastGoodQuality", sandbox)
  lq !== 'undefined' ? ok('state.lastGoodQuality 已初始化', lq) : bad('state.lastGoodQuality', 'undefined')
}

/* ---------- 关键：renderSettingsPane 能跑完并绑定成功 ---------- */
console.log('\n【3】renderSettingsPane 绑定（P0 回归点）')
try {
  vm.runInContext('renderSettingsPane()', sandbox, { timeout: 10000 })
  ok('renderSettingsPane 执行无异常')
} catch (e) {
  bad('renderSettingsPane 执行', e.message)
}

/* .dl-fmt 的 onclick 是否真的绑上了 */
const fmtBtns = classSets['.dl-fmt']
const fmtBound = fmtBtns.filter((b) => typeof b.onclick === 'function').length
fmtBound === fmtBtns.length
  ? ok('.dl-fmt 全部绑定 (' + fmtBound + '/' + fmtBtns.length + ')')
  : bad('.dl-fmt 绑定', fmtBound + '/' + fmtBtns.length + ' —— 说明那段还是没执行到')

/* [data-mode] */
const modeBtns = classSets['[data-mode]']
const modeBound = modeBtns.filter((b) => typeof b.onclick === 'function').length
modeBound === modeBtns.length
  ? ok('[data-mode] 全部绑定 (' + modeBound + '/' + modeBtns.length + ')')
  : bad('[data-mode] 绑定', modeBound + '/' + modeBtns.length)

/* [data-sleep] */
const sleepBtns = classSets['[data-sleep]']
const sleepBound = sleepBtns.filter((b) => typeof b.onclick === 'function').length
sleepBound === sleepBtns.length
  ? ok('[data-sleep] 全部绑定 (' + sleepBound + '/' + sleepBtns.length + ')')
  : bad('[data-sleep] 绑定', sleepBound + '/' + sleepBtns.length)

/* setDesktop */
const sd = registry.get('setDesktop')
typeof sd.onclick === 'function' ? ok('#setDesktop 绑定') : bad('#setDesktop 绑定', typeof sd.onclick)

/* btnResetData */
const rd = registry.get('btnResetData')
typeof rd.onclick === 'function' ? ok('#btnResetData 绑定') : bad('#btnResetData 绑定', typeof rd.onclick)

/* ---------- renderNowPlaying(null) ---------- */
console.log('\n【4】renderNowPlaying(null)（B87 回归点）')
try {
  vm.runInContext('renderNowPlaying(null, true)', sandbox, { timeout: 10000 })
  ok('renderNowPlaying(null) 执行无异常')
  const npName = registry.get('npName')
  npName.textContent === '未在播放'
    ? ok('#npName 已清空', JSON.stringify(npName.textContent))
    : bad('#npName 清空', '实际=' + JSON.stringify(npName.textContent))
  const coverImg = registry.get('coverImg')
  coverImg.src === undefined || coverImg.src === ''
    ? ok('#coverImg src 已移除')
    : bad('#coverImg src 移除', '实际=' + coverImg.src)
} catch (e) {
  bad('renderNowPlaying(null) 执行', e.message)
}

/* ---------- esc ---------- */
console.log('\n【5】XSS 转义')
try {
  const r = vm.runInContext("esc('<img src=x onerror=alert(1)>')", sandbox)
  !r.includes('<img') ? ok('esc 转义尖括号', JSON.stringify(r).slice(0, 50)) : bad('esc 转义', r)
} catch (e) { bad('esc', e.message) }

/* ---------- streamSrc 签名 ---------- */
console.log('\n【6】streamSrc forceFresh')
try {
  const src = vm.runInContext('streamSrc.toString()', sandbox)
  src.includes('forceFresh') ? ok('streamSrc 接受 forceFresh 参数') : bad('streamSrc forceFresh', '签名里没有')
} catch (e) { bad('streamSrc 签名', e.message) }

/* ---------- 汇总 ---------- */
console.log('\n========== 结果 ==========')
console.log('通过 ' + pass + ' / 失败 ' + fail)
if (fail) {
  console.log('\n失败项:')
  failures.forEach((f) => console.log('  - ' + f))
  process.exitCode = 1
} else {
  console.log('\n全部通过')
}
