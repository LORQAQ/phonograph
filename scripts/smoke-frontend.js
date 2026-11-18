'use strict'
/* 前端启动冒烟测试：用最小 DOM 桩执行 public/app.js */
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')

const BASE = 'http://127.0.0.1:37621'
const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8')

function classList () {
  const set = new Set()
  return {
    add: (c) => set.add(c), remove: (c) => set.delete(c),
    toggle: (c) => (set.has(c) ? set.delete(c) : set.add(c)),
    contains: (c) => set.has(c),
  }
}

function el (tag = 'div') {
  const target = {
    tagName: String(tag).toUpperCase(),
    id: '', className: '', textContent: '', innerHTML: '', value: '', title: '', src: '',
    volume: 1, muted: false, currentTime: 0, duration: 0, paused: true,
    style: {},
    dataset: {},
    classList: classList(),
    children: [],
    appendChild (c) { this.children.push(c); return c },
    removeChild (c) { this.children = this.children.filter((x) => x !== c) },
    remove () {},
    focus () {}, select () {}, click () {},
    addEventListener () {}, removeEventListener () {},
    setAttribute () {}, getAttribute () { return '' }, removeAttribute () {},
    querySelector () { return el() },
    querySelectorAll () { return [] },
    getBoundingClientRect () { return { left: 0, top: 0, width: 200, height: 10 } },
    closest () { return null },
    getContext () { return { clearRect () {}, beginPath () {}, closePath () {}, arc () {}, moveTo () {}, lineTo () {}, stroke () {}, fill () {}, fillRect () {}, createLinearGradient: () => ({ addColorStop () {} }), createRadialGradient: () => ({ addColorStop () {} }), roundRect () {} } },
    play () { return Promise.resolve() },
    pause () {},
    load () {},
    offsetTop: 0, offsetLeft: 0, clientHeight: 200, clientWidth: 600, width: 520, height: 72,
  }
  target.style = new Proxy({}, {
    get: (t, k) => {
      if (k === 'setProperty' || k === 'removeProperty') return () => {}
      return t[k] || ''
    },
    set: (t, k, v) => { t[k] = v; return true },
  })
  return target
}

const store = new Map()
const elCache = new Map()
const fetchLog = []
const sandbox = {
  console,
  setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms || 0, 5)),
  clearTimeout,
  setInterval: () => 0,
  clearInterval: () => {},
  requestAnimationFrame: () => 0,
  cancelAnimationFrame: () => {},
  navigator: { clipboard: { writeText: () => Promise.resolve() } },
  URLSearchParams,
  URL,
  Promise,
  Math,
  Date,
  JSON,
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  },
  document: {
    querySelector: (s) => {
      if (!elCache.has(s)) elCache.set(s, el(s))
      return elCache.get(s)
    },
    querySelectorAll: () => [],
    createElement: (t) => el(t),
    addEventListener: () => {},
    body: el('body'),
    documentElement: { style: { setProperty () {}, getPropertyValue: () => '#31c27c' } },
  },
  window: {
    addEventListener: () => {},
    innerWidth: 1400,
    innerHeight: 900,
    AudioContext: undefined,
    open: () => null,
  },
  getComputedStyle: () => ({ getPropertyValue: () => '#31c27c' }),
  BroadcastChannel: class { constructor () {} postMessage () {} close () {} },
  fetch: (p, o) => {
    fetchLog.push(String(p).slice(0, 90))
    return fetch(p.startsWith('http') ? p : BASE + p, o)
  },
}
sandbox.window.document = sandbox.document
sandbox.globalThis = sandbox

const ctx = vm.createContext(sandbox)
let failed = false
try {
  vm.runInContext(js, ctx, { filename: 'app.js', timeout: 15000 })
} catch (e) {
  failed = true
  console.log('❌ 执行期异常:', e.message)
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

;(async () => {
  await wait(2500)
  if (failed) process.exit(1)
  console.log('✅ 启动完成（歌单 / 音源 / 空搜索视图）')

  // 搜索
  try {
    elCache.get('#searchInput').value = '夜曲'
    await vm.runInContext('doSearch()', ctx)
    const n = vm.runInContext('state.results.length', ctx)
    const first = vm.runInContext('state.results[0] && state.results[0].name', ctx)
    console.log(n > 0 ? `✅ 搜索返回 ${n} 条，首条：${first}` : '❌ 搜索无结果')
    if (!n) process.exit(1)

    // 播放
    vm.runInContext('playSong(state.results[0], state.results)', ctx)
    await wait(4000)
    const cur = vm.runInContext('state.currentSong && state.currentSong.name', ctx)
    const badge = elCache.get('#srcBadge').textContent
    const audioEl = elCache.get('#audio')
    console.log(cur ? `✅ 播放已启动：${cur}` : '❌ 播放未启动')
    console.log('   音源徽标：' + badge)
    console.log('   audio.src：' + String(audioEl.src).slice(0, 100))
    console.log('   队列长度：' + vm.runInContext('state.queue.length', ctx))
    console.log('   歌词行数：' + vm.runInContext('state.lyrics.length', ctx))
    console.log('   请求记录：' + [...new Set(fetchLog.map((u) => u.split('?')[0]))].join(' '))
  } catch (e) {
    console.log('❌ 交互流程异常:', e.message)
    process.exit(1)
  }
  process.exit(0)
})()
