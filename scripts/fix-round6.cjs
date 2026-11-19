'use strict'
/* 第六轮：修剩余 7 项 —— 一次改一处，每处都打印现场确认 */
const path = require('node:path')
process.chdir(path.resolve(__dirname, '..'))
const fs = require('node:fs')

const results = []
function step (name, fn) {
  try {
    const r = fn()
    results.push({ name, ok: true, msg: r || '' })
    console.log('  ✓ ' + name + (r ? '  ' + r : ''))
  } catch (e) {
    results.push({ name, ok: false, msg: e.message })
    console.log('  ✗ ' + name + '  ' + e.message)
  }
}

/* ============ 1. renderDownloadsView 复位 state.view ============ */
step('1. renderDownloadsView 复位 state.view', () => {
  const p = 'public/app.js'
  let s = fs.readFileSync(p, 'utf8')
  const old = `async function renderDownloadsView () {
  setViewTitle('下载管理', '')`
  if (!s.includes(old)) throw new Error('锚点不匹配')
  s = s.replace(old, `async function renderDownloadsView () {
  /* P3-2: 其它 render*View 都会复位 state.view，只有这个漏了。
     经 navGo（前进/后退）进来时没人写，导致下载成功后
     if (state.view === 'downloads') renderDownloadsView() 不触发。 */
  state.view = 'downloads'
  $$('.rail-item').forEach((b) => b.classList.toggle('active', b.dataset.view === 'downloads'))
  setViewTitle('下载管理', '')`)
  fs.writeFileSync(p, s, 'utf8')
  return '已加'
})

/* ============ 2. #btnRecImport 接上 ============ */
step('2. #btnRecImport 绑定', () => {
  const p = 'public/app.js'
  let s = fs.readFileSync(p, 'utf8')
  if (s.includes("$('#btnRecImport').onclick")) return '已绑定'

  /* 找 openRecDialog 或 pendingRec，在那里绑 */
  const anchor = `function openRecDialog (`
  const i = s.indexOf(anchor)
  if (i < 0) {
    /* 没有 openRecDialog，看 pendingRec */
    const j = s.indexOf('pendingRec')
    if (j < 0) throw new Error('既没有 openRecDialog 也没有 pendingRec')
    throw new Error('openRecDialog 不存在，pendingRec @' + j)
  }
  /* 在函数体内绑 */
  const bs = s.indexOf('{', i)
  s = s.slice(0, bs + 1) + `
  /* 推荐弹窗里的「导入到我的歌单」按钮一直没绑，点了没反应 */
  const __ri = $('#btnRecImport')
  if (__ri) {
    __ri.onclick = () => {
      const p2 = pendingRec
      try { $('#overlayRec').classList.remove('show') } catch (e) { }
      if (p2 && p2.id) importFromCard(p2.platform, p2.id)
    }
  }` + s.slice(bs + 1)
  fs.writeFileSync(p, s, 'utf8')
  return '已绑定'
})

/* ============ 3. isPrivateHost 补 127.1 / 0x7f.0.0.1 ============ */
step('3. isPrivateHost 补简写形式', () => {
  const p = 'app/server.js'
  let s = fs.readFileSync(p, 'utf8')
  const old = `  let host = String(h).toLowerCase().replace(/^\\[|\\]$/g, '').replace(/\\.$/, '')
  if (/^::ffff:(\\d+\\.\\d+\\.\\d+\\.\\d+)$/.test(host)) host = host.replace(/^::ffff:/, '')
  if (/^0x[0-9a-f]+$/i.test(host)) { try { host = String(parseInt(host, 16)) } catch (e) { } }
  if (/^\\d+$/.test(host)) { try { host = '0.0.0.' + host } catch (e) { } }`
  if (!s.includes(old)) throw new Error('锚点不匹配')

  s = s.replace(old, `  let host = String(h).toLowerCase().replace(/^\\[|\\]$/g, '').replace(/\\.$/, '')
  /* IPv4-mapped */
  if (/^::ffff:(\\d+\\.\\d+\\.\\d+\\.\\d+)$/.test(host)) host = host.replace(/^::ffff:/, '')

  /* P3-2: 浏览器的 URL 会把 127.1 / 0x7f.0.0.1 / 2130706433 / 0177.0.0.1
     都当合法 IP，但 net.isIPv4 只认标准四段十进制。这里先把各种写法归一。
     inet_aton 规则：a.b.c.d 里每段可以是十进制/八进制(0开头)/十六进制(0x开头)，
     段数可以是 1~4，缺的段按 256 进位补齐。 */
  const __aton = (str) => {
    const parts = String(str).split('.')
    if (parts.length > 4) return null
    const nums = []
    for (const raw of parts) {
      if (!raw) return null
      let v
      if (/^0x[0-9a-f]+$/i.test(raw)) v = parseInt(raw, 16)
      else if (/^0[0-7]+$/.test(raw)) v = parseInt(raw, 8)
      else if (/^[0-9]+$/.test(raw)) v = parseInt(raw, 10)
      else return null
      if (!Number.isFinite(v) || v < 0) return null
      nums.push(v)
    }
    /* 最后一段的有效位数取决于段数 */
    const n = nums.length
    if (nums.slice(0, n - 1).some((x) => x > 255)) return null
    if (nums[n - 1] >= Math.pow(256, 5 - n)) return null
    let ip = 0
    for (let i2 = 0; i2 < n; i2++) {
      if (i2 === n - 1) ip += nums[i2]
      else ip += nums[i2] * Math.pow(256, 3 - i2)
    }
    return [(ip >>> 24) & 255, (ip >>> 16) & 255, (ip >>> 8) & 255, ip & 255].join('.')
  }
  if (!/^[0-9a-fx.]+$/i.test(host) || !host.includes('.')) {
    /* 纯数字或纯 hex 也走 aton */
    if (/^[0-9]+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) {
      const n1 = __aton(host)
      if (n1) host = n1
    }
  } else if (!net.isIPv4(host)) {
    const n2 = __aton(host)
    if (n2) host = n2
  }`)

  fs.writeFileSync(p, s, 'utf8')
  return '已补'
})

/* ============ 4. LocalProxy reason 补 431/429 ============ */
step('4. LocalProxy.reason 补 431/429', () => {
  const p = '../apk-build/app/src/com/phonograph/player/LocalProxy.java'
  let s = fs.readFileSync(p, 'utf8')
  const old = `            case 416: return "Range Not Satisfiable";`
  if (!s.includes(old)) throw new Error('锚点不匹配')
  if (s.includes('case 431:')) return '已存在'
  s = s.replace(old, `            case 416: return "Range Not Satisfiable";
            case 408: return "Request Timeout";
            case 413: return "Payload Too Large";
            case 429: return "Too Many Requests";
            case 431: return "Request Header Fields Too Large";`)
  fs.writeFileSync(p, s, 'utf8')
  return '已补'
})

/* ============ 5. 手机端 tx/kg newSongs 统一返回 [] ============ */
step('5. 手机端 tx/kg newSongs 统一', () => {
  const p = 'mobile/www/api-mobile.js'
  let s = fs.readFileSync(p, 'utf8')
  const old = `      if (source === 'tx') return { platform: source, offset, playlists: await NET_TX.recommendPlaylists(offset, limit), newSongs: NET_WY.newSongs ? await NET_WY.newSongs(10).catch(() => []) : [] }
      if (source === 'kg') return { platform: source, offset, playlists: await NET_KG.recommendPlaylists(offset, limit), newSongs: NET_WY.newSongs ? await NET_WY.newSongs(10).catch(() => []) : [] }
      return { platform: source, offset, playlists: await NET_WY.recommendPlaylists(offset, limit), newSongs: NET_WY.newSongs ? await NET_WY.newSongs(10).catch(() => []) : [] }`
  if (!s.includes(old)) throw new Error('锚点不匹配')

  s = s.replace(old, `      /* P2-8: 「发现页」只放本平台内容。原来 tx/kg 分支也去拉网易云新歌 ——
         切到 QQ/酷狗显示的却是网易云的歌，而且桌面端这些分支返回 []，两端不一致。 */
      const __newSongs = (plat) => {
        if (plat !== 'wy') return []
        return NET_WY.newSongs ? NET_WY.newSongs(10).catch(() => []) : []
      }
      if (source === 'tx') {
        const playlists = await NET_TX.recommendPlaylists(offset, limit)
        return { platform: source, offset, playlists, newSongs: await __newSongs('tx') }
      }
      if (source === 'kg') {
        const playlists = await NET_KG.recommendPlaylists(offset, limit)
        return { platform: source, offset, playlists, newSongs: await __newSongs('kg') }
      }
      {
        const playlists = await NET_WY.recommendPlaylists(offset, limit)
        return { platform: source, offset, playlists, newSongs: await __newSongs('wy') }
      }`)
  fs.writeFileSync(p, s, 'utf8')
  return '已统一'
})

console.log('\n=== 结果 ===')
const bad = results.filter((r) => !r.ok)
console.log('成功 ' + (results.length - bad.length) + ' / 失败 ' + bad.length)
if (bad.length) process.exitCode = 1
