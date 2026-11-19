'use strict'
/* 修 audit5-func 剩下的 P1/P2 */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

const results = []
function step (name, fn) {
  try { const r = fn(); results.push({ name, ok: true }); console.log('  ✓ ' + name + (r ? '  ' + r : '')) }
  catch (e) { results.push({ name, ok: false, msg: e.message }); console.log('  ✗ ' + name + '  ' + e.message) }
}

/* ============ P1-12: .lyric-roll .ll 移进媒体查询 ============ */
step('P1-12 .lyric-roll .ll 只在窄屏压字号', () => {
  const p = 'public/style.css'
  let c = fs.readFileSync(p, 'utf8')
  const old = `/* 歌词字号在窄屏下略微收一点，多显示几行 */
.lyric-roll .ll{font-size:13px;line-height:1.7}`
  if (!c.includes(old)) {
    /* 宽松匹配 */
    const re = /\/\* 歌词字号在窄屏下略微收一点，多显示几行 \*\/\s*\n\.lyric-roll \.ll\{font-size:13px;line-height:1\.7\}/
    if (re.test(c)) {
      c = c.replace(re, '/* 歌词字号在窄屏下略微收一点（必须放媒体查询里，否则桌面端也被压小） */')
    } else {
      throw new Error('锚点不匹配')
    }
  } else {
    c = c.replace(old, '/* 歌词字号在窄屏下略微收一点（必须放媒体查询里） */')
  }
  /* 追加带媒体查询的版本 */
  if (!c.includes('/* lyric-narrow */')) {
    c += `
/* lyric-narrow：窄屏才收字号，桌面保持 clamp(12px,1vw,14.5px) */
@media (max-width:1180px), (max-height:720px){
  .lyric-roll .ll{font-size:13px;line-height:1.7}
}
`
  }
  fs.writeFileSync(p, c, 'utf8')
  return '已移进 media'
})

/* ============ P1-6/P2-9: 服务端 gcid 预算提前 + timedOut 全链路 ============ */
step('P1-6 gcid 预算提到解码之前', () => {
  const p = 'app/lib/kugou-gcid.js'
  let s = fs.readFileSync(p, 'utf8')

  /* 找到内层函数开头，把 deadline 提上去 */
  const old = `async function __fetchGcidPlaylistInner (gcid, opts = {}) {
  const maxSongs = opts.maxSongs || 2000
  const pageSize = 300`

  if (!s.includes(old)) throw new Error('锚点不匹配')

  s = s.replace(old, () => `async function __fetchGcidPlaylistInner (gcid, opts = {}) {
  const maxSongs = opts.maxSongs || 2000
  const pageSize = 300
  /* 预算必须从函数第一行开始算。
     原先建立在 decodeGcid / getListInfo 之后，解码阶段 4×20s 重试 + 7.2s 退避
     完全不计入，实际最长能到 3 分钟。 */
  const __budget = Number(opts.budgetMs) || 60000
  const __deadline = Date.now() + __budget
  const __expired = () => Date.now() > __deadline`)

  /* 删掉后面重复的 deadline 定义 */
  s = s.replace(`  /* 总预算：单请求 20s 超时，但翻 100 页没有上限 ——
     实测有次 preview 拖了 120 秒才被客户端放弃。 */
  const __budget = Number(opts.budgetMs) || 60000
  const __deadline = Date.now() + __budget
  let __timedOut = false`, () => `  let __timedOut = false`)

  /* 每页之后也检查 */
  s = s.replace(`    if (!added) break
    if (total && all.length >= total) break`, () => `    if (!added) break
    if (total && all.length >= total) break
    if (__expired()) { __timedOut = true; break }`)

  fs.writeFileSync(p, s, 'utf8')
  return '预算已提前'
})

/* ============ P1-7: truncated/timedOut 透到 server 响应 ============ */
step('P1-7 truncated 透到 /api/playlist 响应', () => {
  const p = 'app/server.js'
  let s = fs.readFileSync(p, 'utf8')

  /* preview 响应 */
  const pOld = `            preview: { name: r.name, count: (r.songs || []).length, platform: r.platform, cover: r.cover || '' },`
  if (s.includes(pOld)) {
    s = s.replace(pOld, () => `            preview: {
              name: r.name,
              count: (r.songs || []).length,
              total: r.total,
              truncated: !!r.truncated,
              timedOut: !!r.timedOut,
              platform: r.platform,
              cover: r.cover || '',
            },`)
  } else {
    console.log('    preview 锚点没匹配，跳过')
  }

  /* import 响应 */
  const iOld = `          imported: { id: pl.id, name: pl.name, count: pl.songs.length, platform: r.platform },`
  if (s.includes(iOld)) {
    s = s.replace(iOld, () => `          imported: {
            id: pl.id,
            name: pl.name,
            count: pl.songs.length,
            total: r.total,
            truncated: !!r.truncated,
            timedOut: !!r.timedOut,
            skipped: r.skipped || 0,
            platform: r.platform,
          },`)
  } else {
    console.log('    import 锚点没匹配')
  }

  fs.writeFileSync(p, s, 'utf8')
  return '已透传'
})

/* ============ P2-11: C# openUrlFail 前端处理 ============ */
step('P2-11 openUrlFail 前端分支', () => {
  const p = 'public/app.js'
  let s = fs.readFileSync(p, 'utf8')
  const anchor = `if (data.startsWith('openDirFail:'))`
  if (s.includes(anchor) && !s.includes("openUrlFail:")) {
    const i = s.indexOf(anchor)
    const ls = s.lastIndexOf('\n', i) + 1
    s = s.slice(0, ls) + `if (data.startsWith('openUrlFail:')) {
      const u = data.slice('openUrlFail:'.length)
      try { if (navigator.clipboard) navigator.clipboard.writeText(u) } catch (e) { }
      toast('系统没能打开浏览器，下载地址已复制到剪贴板', 3600)
      return
    }
    ` + s.slice(ls)
    fs.writeFileSync(p, s, 'utf8')
    return '已加'
  }
  if (s.includes('openUrlFail:')) return '已有'
  throw new Error('没找到 openDirFail 锚点')
})

/* ============ P3-16: isPrivateHost 支持 ::ffff:7f00:1 ============ */
step('P3-16 isPrivateHost 支持 IPv4-mapped 十六进制', () => {
  const p = 'app/server.js'
  let s = fs.readFileSync(p, 'utf8')
  const anchor = `  /* IPv4-mapped */
  if (/^::ffff:(\\d+\\.\\d+\\.\\d+\\.\\d+)$/.test(host)) host = host.replace(/^::ffff:/, '')`
  if (s.includes(anchor)) {
    s = s.replace(anchor, () => `  /* IPv4-mapped：点分形式 ::ffff:a.b.c.d 和十六进制形式 ::ffff:7f00:1 都要认 */
  if (/^::ffff:(\\d+\\.\\d+\\.\\d+\\.\\d+)$/.test(host)) {
    host = host.replace(/^::ffff:/, '')
  } else {
    const mv = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
    if (mv) {
      const hi = parseInt(mv[1], 16)
      const lo = parseInt(mv[2], 16)
      host = [(hi >> 8) & 255, hi & 255, (lo >> 8) & 255, lo & 255].join('.')
    }
  }`)
    fs.writeFileSync(p, s, 'utf8')
    return '已支持'
  }
  throw new Error('锚点不匹配')
})

console.log('\n=== 结果 ===')
const bad = results.filter((r) => !r.ok)
console.log('成功 ' + (results.length - bad.length) + ' / 失败 ' + bad.length)
