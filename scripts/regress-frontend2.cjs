'use strict'
/* 前端逻辑实测 v2：从 index.html + app.js 模板提取全部 id，补全假 DOM */
const path = require('node:path')
const fs = require('node:fs')
const vm = require('node:vm')

process.chdir(path.resolve(__dirname, '..'))

let pass = 0
let fail = 0
const failures = []
function ok (n, e) { pass++; console.log('  ✓ ' + n + (e ? '  ' + e : '')) }
function bad (n, d) { fail++; failures.push(n + (d ? '  — ' + d : '')); console.log('  ✗ ' + n + (d ? '  ' + d : '')) }

/* ---------- 收集所有 id（index.html + app.js 内联模板）---------- */
const html = fs.readFileSync('public/index.html', 'utf8')
const appCode = fs.readFileSync('public/app.js', 'utf8')
const allIds = new Set()
let m
const reId = /id=["']([^"']+)["']/g
while ((m = reId.exec(html))) allIds.add(m[1])
while ((m = reId.exec(appCode))) allIds.add(m[1])
/* id=\"xxx\" 转义形式 */
const reId2 = /id=\\"([^"\\]+)\\"/g
while ((m = reId2.exec(appCode))) allIds.add(m[1])

/* 收集 $$ 用到的选择器 */
const sels = new Set()
const reSel = /(?:\$\$|querySelectorAll)\(\s*['"]([^'"]+)['"]/g
while ((m = reSel.exec(appCode))) sels.add(m[1])

console.log('id: ' + allIds.size + ' 个，选择器: ' + sels.size + ' 个\n')

/* ---------- 假 DOM ---------- */
function makeEl (tag, id) {
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    id: id || '',
    className: '',
    _html: '', _text: '', _value: undefined,
    dataset: {}, style: { setProperty () { }, removeProperty () { }, getPropertyValue: () => '' },
    children: [], parentNode: null,
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
    insertBefore (c) { this.children.push(c); c.parentNode = this; return c },
    removeChild (c) { this.children = this.children.filter((x) => x !== c); return c },
    setAttribute (k, v) { this[k] = v },
    getAttribute (k) { return this[k] },
    removeAttribute (k) { delete this[k] },
    addEventListener () { }, removeEventListener () { },
    querySelector () { return null }, querySelectorAll () { return [] },
    getBoundingClientRect () { return { top: 0, left: 0, width: 100, height: 20, bottom: 20, right: 100 } },
    scrollTo () { }, focus () { }, remove () { }, closest () { return null },
    click () { if (this.onclick) this.onclick({ target: this, preventDefault () { } }) },
    offsetTop: 0, clientHeight: 100, offsetHeight: 20, clientWidth: 100,
    getElementsByTagName () { return [] },
    options: [{ textContent: '标准' }, { textContent: '高' }], selectedIndex: 0,
  }
  return el
}

const registry = new Map()
for (const id of allIds) registry.set(id, makeEl('div', id))

/* 每个选择器给 2-4 个假元素 */
const classSets = {}
for (const sel of sels) {
  const n = sel === '.lyric-line' ? 5 : 3
  classSets[sel] = Array.from({ length: n }, (_, i) => {
    const e = makeEl('div')
    e.dataset = { fmt: i === 0 ? 'mp3' : 'flac', mode: ['light', 'warm', 'dark'][i % 3], sleep: String([15, 30, 60, 0][i % 4]), view: 'playlist', id: 'x' + i, color: '#1f9d55', close: 'overlayX' }
    return e
  })
}

const bodyEl = makeEl('body')
const audioEl = registry.get('audio') || makeEl('audio')
audioEl.play = () => Promise.resolve()
audioEl.pause = () => { }
audioEl.load = () => { }
audioEl.currentTime = 0
audioEl.duration = 200
audioEl.volume = 0.8
audioEl.muted = false
audioEl.src = ''

const doc = {
  documentElement: makeEl('html'),
  body: bodyEl,
  head: makeEl('head'),
  readyState: 'complete',
  cookie: '',
  getElementById (id) { return registry.get(id) || null },
  querySelector (sel) {
    if (sel.startsWith('#')) return registry.get(sel.slice(1)) || null
    if (classSets[sel]) return classSets[sel][0] || null
    const mm = sel.match(/^#([\w-]+)/)
    if (mm) return registry.get(mm[1]) || null
    /* .a.b 之类 */
    for (const k of Object.keys(classSets)) if (sel.includes(k)) return classSets[k][0] || null
    return null
  },
  querySelectorAll (sel) {
    if (sel.startsWith('#')) {
      const e = registry.get(sel.slice(1))
      return e ? [e] : []
    }
    if (classSets[sel]) return classSets[sel]
    const mm = sel.match(/^#([\w-]+)/)
    if (mm) { const e = registry.get(mm[1]); return e ? [e] : [] }
    for (const k of Object.keys(classSets)) if (sel.includes(k)) return classSets[k]
    return []
  },
  createElement (t) { return makeEl(t) },
  createTextNode (t) { const e = makeEl('#text'); e._text = t; return e },
  addEventListener () { }, removeEventListener () { },
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

const sandbox = {
  console, document: doc, localStorage,
  navigator: { userAgent: 'audit4', language: 'zh-CN' },
  location: { href: 'http://127.0.0.1:37621/', origin: 'http://127.0.0.1:37621', reload () { }, hash: '', search: '', pathname: '/' },
  setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask,
  Promise, Map, Set, WeakMap, WeakSet, JSON, Math, Date, Number, String, Boolean, Array, Object, RegExp, Error, Symbol,
  parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, encodeURI, decodeURI,
  fetch: () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}), text: () => Promise.resolve('') }),
  requestAnimationFrame: (fn) => setTimeout(fn, 16),
  cancelAnimationFrame: clearTimeout,
  getComputedStyle: () => ({ position: 'relative', getPropertyValue: () => '', transform: 'none' }),
  matchMedia: () => ({ matches: false, addEventListener () { }, addListener () { } }),
  alert: () => { }, confirm: () => true, prompt: () => '',
  Audio: function () { return makeEl('audio') },
  Image: function () { return makeEl('img') },
  URL, URLSearchParams, AbortController,
  crypto: require('node:crypto').webcrypto,
  performance: { now: () => Date.now() },
  innerWidth: 1280, innerHeight: 800,
  devicePixelRatio: 1,
}
sandbox.window = sandbox
sandbox.globalThis = sandbox
sandbox.self = sandbox
sandbox.top = sandbox
sandbox.addEventListener = function () { }
sandbox.removeEventListener = function () { }
sandbox.dispatchEvent = function () { }
sandbox.onerror = null
sandbox.parent = sandbox

vm.createContext(sandbox)

console.log('========== 前端逻辑实测 ==========\n')
console.log('【1】加载')

const errors = []
const origWarn = console.warn
const origErr = console.error
sandbox.console = Object.assign({}, console, {
  warn: (...a) => { errors.push('warn: ' + a.join(' ')); origWarn.apply(console, a) },
  error: (...a) => { errors.push('error: ' + a.join(' ')); origErr.apply(console, a) },
})

try {
  vm.runInContext(appCode, sandbox, { filename: 'app.js', timeout: 20000 })
  ok('加载无异常')
} catch (e) {
  bad('加载', e.message)
}

/* boot 的异步部分可能还在跑，给它一点时间 */
setTimeout(() => {
  const initErr = errors.filter((x) => /初始化失败|初始化/.test(x))
  initErr.length === 0 ? ok('boot 无初始化失败') : bad('boot', initErr[0].slice(0, 160))
  const others = errors.filter((x) => !/初始化/.test(x))
  others.length === 0 ? ok('无 warn/error 输出') : console.log('  ℹ 其他输出 ' + others.length + ' 条: ' + others.slice(0, 3).join(' | ').slice(0, 150))

  runChecks()
}, 500)

function runChecks () {
  function hasFn (n) { try { return vm.runInContext('typeof ' + n, sandbox) === 'function' } catch (e) { return false } }
  function hasVar (n) { try { return vm.runInContext('typeof ' + n, sandbox) !== 'undefined' } catch (e) { return false } }

  console.log('\n【2】关键函数')
  const fns = ['renderSettingsPane', 'renderNowPlaying', 'reloadCurrent', 'startSong', 'doSearch',
    'paintProgress', 'setSrc', 'updatePlayButton', 'renderDownloadsView', 'saveQueue',
    'setThemeMode', 'setSleep', 'esc', 'streamSrc']
  for (const f of fns) hasFn(f) ? ok(f) : bad(f, '未定义')

  /* setQuality 可能不存在，单独看 */
  const sq = vm.runInContext('typeof setQuality', sandbox)
  console.log('  ℹ setQuality = ' + sq + (sq === 'undefined' ? '（代码里可能叫别的，比如 rollbackUi/onchange 内联）' : ''))

  console.log('\n【3】state')
  hasVar('state') ? ok('state 存在') : bad('state')
  if (hasVar('state')) {
    const lq = vm.runInContext('state.lastGoodQuality', sandbox)
    lq !== undefined ? ok('lastGoodQuality = ' + JSON.stringify(lq)) : bad('lastGoodQuality', 'undefined')
    const v = vm.runInContext('state.view', sandbox)
    console.log('  ℹ state.view = ' + JSON.stringify(v))
  }

  console.log('\n【4】renderSettingsPane（P0 回归点）')
  let spErr = null
  try { vm.runInContext('renderSettingsPane()', sandbox, { timeout: 15000 }) } catch (e) { spErr = e }
  spErr ? bad('执行', spErr.message) : ok('执行无异常')

  const dl = classSets['.dl-fmt'] || []
  const dlOk = dl.filter((b) => typeof b.onclick === 'function').length
  dlOk === dl.length && dl.length > 0 ? ok('.dl-fmt 绑定 ' + dlOk + '/' + dl.length) : bad('.dl-fmt 绑定', dlOk + '/' + dl.length)

  const dm = classSets['[data-mode]'] || []
  const dmOk = dm.filter((b) => typeof b.onclick === 'function').length
  dmOk === dm.length && dm.length > 0 ? ok('[data-mode] 绑定 ' + dmOk + '/' + dm.length) : bad('[data-mode] 绑定', dmOk + '/' + dm.length)

  const ds = classSets['[data-sleep]'] || []
  const dsOk = ds.filter((b) => typeof b.onclick === 'function').length
  dsOk === ds.length && ds.length > 0 ? ok('[data-sleep] 绑定 ' + dsOk + '/' + ds.length) : bad('[data-sleep] 绑定', dsOk + '/' + ds.length)

  const sd = registry.get('setDesktop')
  typeof sd.onclick === 'function' ? ok('#setDesktop 绑定') : bad('#setDesktop 绑定', String(typeof sd.onclick))
  const rd = registry.get('btnResetData')
  typeof rd.onclick === 'function' ? ok('#btnResetData 绑定') : bad('#btnResetData 绑定', String(typeof rd.onclick))
  const sq2 = registry.get('setQuality')
  typeof sq2.onchange === 'function' ? ok('#setQuality onchange 绑定') : bad('#setQuality', String(typeof sq2.onchange))

  console.log('\n【5】renderNowPlaying(null)（B87）')
  try {
    vm.runInContext('renderNowPlaying(null, true)', sandbox, { timeout: 10000 })
    ok('执行无异常')
    const nn = registry.get('npName')
    nn.textContent === '未在播放' ? ok('#npName = 未在播放') : bad('#npName', JSON.stringify(nn.textContent))
  } catch (e) { bad('执行', e.message) }

  console.log('\n【6】其他')
  try {
    const r = vm.runInContext("esc('<b>x</b>')", sandbox)
    !r.includes('<b>') ? ok('esc 转义') : bad('esc', r)
  } catch (e) { bad('esc', e.message) }

  const src = vm.runInContext('streamSrc.toString()', sandbox)
  src.includes('forceFresh') ? ok('streamSrc 有 forceFresh') : bad('streamSrc', '无')

  console.log('\n========== 结果 ==========')
  console.log('通过 ' + pass + ' / 失败 ' + fail)
  if (fail) {
    console.log('\n失败:')
    failures.forEach((f) => console.log('  - ' + f))
    process.exitCode = 1
  } else console.log('\n全部通过')
}
