'use strict'
/* P1-8：把桌面端已验证的 backend 状态机搬到手机端 */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

const p = 'mobile/www/api-mobile.js'
let s = fs.readFileSync(p, 'utf8')

/* 1. 预算提到解码之前 */
const oldHead = `async function kgGcidPlaylist (gcid, maxSongs, opts) {
  const limitTotal = maxSongs || 2000
  const pageSize = 300
  const globalId = await __kgDecodeGcid(gcid)`

if (!s.includes(oldHead)) { console.log('✗ 函数头不匹配'); process.exit(1) }

s = s.replace(oldHead, () => `async function kgGcidPlaylist (gcid, maxSongs, opts) {
  const limitTotal = maxSongs || 2000
  const pageSize = 300
  /* 预算从函数第一行算起，解码阶段的限流重试也计入 */
  const __budget = Number(opts && opts.budgetMs) || 60000
  const __deadline = Date.now() + __budget
  const __expired = () => Date.now() > __deadline

  const globalId = await __kgDecodeGcid(gcid)`)

/* 2. 删掉后面重复的 budget 定义 */
s = s.replace(`  /* 总预算：单请求 40s 超时，但翻页没有总上限 */
  const __budget = Number(opts && opts.budgetMs) || 60000
  const __deadline = Date.now() + __budget
  let __timedOut = false`, () => `  let __timedOut = false`)

/* 3. 替换翻页循环为 backend 状态机 */
const oldLoop = `    let r = null
    try {
      r = await __kgSongPage(globalId, page, pageSize)
    } catch (e) {
      if (!usedAlt) {
        usedAlt = true
        try { r = await __kgSongPageAlt(globalId, page, pageSize) } catch (e2) {
          if (page === 1) throw new Error('酷狗歌单拉取失败：' + e2.message)
          break
        }
      } else if (page === 1) {
        throw new Error('酷狗歌单拉取失败：' + e.message)
      } else { break }
    }
    if (!r) break
    if (r.total > total) total = r.total
    const list = r.list || []
    if (!list.length) break
    for (const x of list) {
      const sm = __kgMapSong(x)
      if (!sm || seen.has(sm.id)) continue
      seen.add(sm.id)
      all.push(sm)
      if (all.length >= limitTotal) break
    }
    if (total && all.length >= total) break
    if (list.length < pageSize) break
    await new Promise((r2) => setTimeout(r2, 200))`

if (!s.includes(oldLoop)) { console.log('✗ 循环不匹配'); process.exit(1) }

s = s.replace(oldLoop, () => `    /* 与桌面端一致：backend 是「当前用哪个接口」的状态，
       而不是一次性开关。之前 usedAlt 置位后第 2 页仍先打 song_v2，
       一失败就 break —— 800 首的歌单只能拿到 300 首。 */
    let r = null
    let lastErr = null
    const plan = backend === 'alt' ? ['alt'] : ['web', 'alt']
    for (const b2 of plan) {
      try {
        r = b2 === 'web'
          ? await __kgSongPage(globalId, page, pageSize)
          : await __kgSongPageAlt(globalId, page, pageSize)
        backend = b2
        break
      } catch (e) {
        lastErr = e
      }
    }
    if (!r) {
      if (page === 1) throw new Error('酷狗歌单拉取失败：' + (lastErr && lastErr.message))
      break
    }
    if (r.total > total) total = r.total
    const list = r.list || []
    if (!list.length) break
    /* 以「本页新增数」作为终止条件，而不是 list.length < pageSize
       （上游钳制页大小时会误判结束） */
    let added = 0
    for (const x of list) {
      const sm = __kgMapSong(x)
      if (!sm || seen.has(sm.id)) continue
      seen.add(sm.id)
      all.push(sm)
      added++
      if (all.length >= limitTotal) break
    }
    if (!added) break
    if (total && all.length >= total) break
    if (__expired()) { __timedOut = true; break }
    await new Promise((r2) => setTimeout(r2, 200))`)

/* 4. usedAlt → backend */
s = s.replace(`  let usedAlt = false`, () => `  let backend = 'web'`)

/* 5. 返回体带上 timedOut，并并进 truncated */
s = s.replace(`    truncated: (total || 0) > all.length || __timedOut,
    timedOut: __timedOut,`, () => `    truncated: (total || 0) > all.length || __timedOut,
    timedOut: __timedOut,`)

fs.writeFileSync(p, s, 'utf8')
console.log('✓ 手机端已移植 backend 状态机')
console.log('  backend:', s.includes("let backend = 'web'") ? '✓' : '✗')
console.log('  added 判定:', s.includes('if (!added) break') ? '✓' : '✗')
console.log('  __expired:', s.includes('__expired()') ? '✓' : '✗')
console.log('  usedAlt 残留:', s.includes('usedAlt') ? '✗ 还有' : '✓ 已清')
