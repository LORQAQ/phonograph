'use strict'
/* 第七轮：gcid 总预算 + 下载回调 id（注意 String.replace 的 $$ 陷阱，全部用函数式替换） */
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

/* ============ 1. gcid 加总预算 ============ */
step('1. gcid 加总预算', () => {
  const p = 'app/lib/kugou-gcid.js'
  let s = fs.readFileSync(p, 'utf8')

  const old = `  let backend = 'web'

  for (let page = 1; page <= 100 && all.length < maxSongs; page++) {`
  if (!s.includes(old)) throw new Error('翻页循环锚点不匹配')

  s = s.replace(old, () => `  let backend = 'web'
  /* 总预算：单请求 20s 超时，但翻 100 页没有上限 ——
     实测有次 preview 拖了 120 秒才被客户端放弃。 */
  const __budget = Number(opts.budgetMs) || 60000
  const __deadline = Date.now() + __budget
  let __timedOut = false

  for (let page = 1; page <= 100 && all.length < maxSongs; page++) {
    if (Date.now() > __deadline) { __timedOut = true; break }`)

  /* 返回里带上 timedOut */
  const retOld = `    truncated: total > all.length,`
  if (s.includes(retOld)) {
    s = s.replace(retOld, () => `    truncated: total > all.length || __timedOut,
    timedOut: __timedOut,`)
  }

  fs.writeFileSync(p, s, 'utf8')
  return '已加 60 秒预算'
})

/* ============ 2. 手机端 gcid 也加预算 ============ */
step('2. 手机端 gcid 加预算', () => {
  const p = 'mobile/www/api-mobile.js'
  let s = fs.readFileSync(p, 'utf8')
  const old = `  let usedAlt = false

  for (let page = 1; page <= 100 && all.length < limitTotal; page++) {`
  if (!s.includes(old)) throw new Error('锚点不匹配')

  s = s.replace(old, () => `  let usedAlt = false
  /* 总预算：单请求 40s 超时，但翻页没有总上限 */
  const __budget = Number(opts && opts.budgetMs) || 60000
  const __deadline = Date.now() + __budget
  let __timedOut = false

  for (let page = 1; page <= 100 && all.length < limitTotal; page++) {
    if (Date.now() > __deadline) { __timedOut = true; break }`)

  const retOld = `  return { platform: 'kg', name: meta.name || '酷狗歌单', cover: meta.cover || '', songs: all, total: total || all.length }`
  if (s.includes(retOld)) {
    s = s.replace(retOld, () => `  return {
    platform: 'kg',
    name: meta.name || '酷狗歌单',
    cover: meta.cover || '',
    songs: all,
    total: total || all.length,
    got: all.length,
    truncated: (total || 0) > all.length || __timedOut,
    timedOut: __timedOut,
  }`)
  }

  /* kgGcidPlaylist 签名要接 opts */
  s = s.replace('async function kgGcidPlaylist (gcid, maxSongs) {', () => `async function kgGcidPlaylist (gcid, maxSongs, opts) {`)

  fs.writeFileSync(p, s, 'utf8')
  return '已加 60 秒预算'
})

/* ============ 3. 下载回调加 id（Java） ============ */
step('3. Java download 回调加 id', () => {
  const p = '../apk-build/app/src/com/phonograph/player/NapiBridge.java'
  let s = fs.readFileSync(p, 'utf8')

  /* 找 window.__onDownload 的调用 */
  const old = `window.__onDownload(`
  if (!s.includes(old)) throw new Error('找不到 __onDownload 调用')

  /* 先看现状 */
  const i = s.indexOf(old)
  const ls = s.lastIndexOf('\n', i - 200)
  console.log('    现状: ' + s.slice(ls + 1, i + 160).replace(/\s+/g, ' ').slice(0, 180))

  /* 把 window.__onDownload(x) 改成 window.__onDownload(id, x) */
  /* 先把 download 方法签名加 id 参数 */
  const dlSig = /public void download\(([^)]*)\)/
  const m = s.match(dlSig)
  if (!m) throw new Error('找不到 download 签名')
  console.log('    download 签名: ' + m[0])

  fs.writeFileSync(p, s, 'utf8')
  return '需人工确认（见上面两行）'
})

console.log('\n=== 结果 ===')
const bad = results.filter((r) => !r.ok)
console.log('成功 ' + (results.length - bad.length) + ' / 失败 ' + bad.length)
if (bad.length) process.exitCode = 1
