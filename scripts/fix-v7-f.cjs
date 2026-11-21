'use strict'
/**
 * 第七轮 · F 批：手机端 JS 剩余问题
 * 1. music-libs.cached() 缓存 rejected promise
 * 2. 脚本分支不做 aac/wma 过滤
 * 3. /api/sources import 无 2MB 上限
 * 4. api-mobile 重复 remove + 死代码 NET_IMPORT
 * 5. lx-engine-web: globalThis.Buffer/lx 不还原
 * 6. lx-engine-web: console 异步日志丢失
 * 7. lx-engine-web: resolve 列表仍含 fish
 */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

const done = []
const miss = []

function editLines (file, fn) {
  const lines = fs.readFileSync(file, 'utf8').split('\n')
  const before = lines.join('\n')
  fn(lines)
  const after = lines.join('\n')
  if (after !== before) { fs.writeFileSync(file, after, 'utf8'); return true }
  return false
}

/* ---------- 1. music-libs cached() ---------- */
{
  const ok = editLines('mobile/www/lib/music-libs.js', (L) => {
    const i = L.findIndex((l) => l.includes('function cached (key, ttl, fn)'))
    if (i < 0) return
    for (let k = i; k < Math.min(i + 12, L.length); k++) {
      if (L[k].includes('cache.set(key, { value: p, exp: Date.now() + ttl })')) {
        L[k] = '  /* P2: 原来把 rejected Promise 也缓存住 —— 一次网络抖动会锁死整个 TTL（酷狗歌词 30 分钟）。\n' +
          '     只缓存成功的值。 */\n' +
          '  const p = fn().catch((e) => { cache.delete(key); throw e })'
      }
    }
  })
  ok ? done.push('cached 不缓存失败') : miss.push('cached')
}

/* 需要把原来的 const p = fn() 那行删掉（否则重复声明） */
{
  const f = 'mobile/www/lib/music-libs.js'
  let s = fs.readFileSync(f, 'utf8')
  /* 检查有没有重复的 const p = fn() */
  const m = s.match(/function cached \(key, ttl, fn\) \{[\s\S]{0,400}?\}/)
  if (m && (m[0].match(/const p = fn\(\)/g) || []).length > 1) {
    /* 删掉旧的那行 */
    const idx = s.indexOf('function cached (key, ttl, fn)')
    const seg = s.slice(idx, idx + 500)
    const segNew = seg.replace(/\n\s*const p = fn\(\)\n/, '\n')
    s = s.slice(0, idx) + segNew + s.slice(idx + 500)
    fs.writeFileSync(f, s, 'utf8')
    done.push('清理重复 const p')
  }
}

/* ---------- 2. 脚本分支 aac/wma 过滤 ---------- */
{
  const ok = editLines('mobile/www/api-mobile.js', (L) => {
    const i = L.findIndex((l) => l.includes("via: 'script'"))
    if (i < 0) return
    /* 在 script 分支返回前加格式判断 */
    const j = L.findIndex((l, k) => k < i && l.includes('if (hit && hit.url)'))
    if (j >= 0) {
      L.splice(j, 0,
        "      /* P2: 脚本返回 .aac/.wma 时 WebView 播不了，但这条主路径没做过滤 ——",
        "         与 resolveUrl 里的过滤自相矛盾。 */",
        "      if (hit && hit.url && badFormat(hit.url)) { hit.url = '' }")
      done.push('脚本分支格式过滤')
    }
  })
  if (!ok) miss.push('aac 过滤')
}

/* 加 badFormat 工具 */
{
  const f = 'mobile/www/api-mobile.js'
  let s = fs.readFileSync(f, 'utf8')
  if (!s.includes('function badFormat')) {
    const anchor = 'async function ensureScripts () {'
    const helper = [
      '/** 裸 aac/wma/ape/cue 在 WebView 里播不了（会报 Format error code 4） */',
      'function badFormat (u) {',
      "  return /\\.(aac|wma|ape|cue)(\\?|$)/i.test(String(u || ''))",
      '}',
      '',
      anchor,
    ].join('\n')
    s = s.replace(anchor, () => helper)
    fs.writeFileSync(f, s, 'utf8')
    done.push('加 badFormat')
  }
}

/* ---------- 3. /api/sources import 2MB 上限 ---------- */
{
  const ok = editLines('mobile/www/api-mobile.js', (L) => {
    const i = L.findIndex((l) => l.includes("if (!code) throw new Error('缺少脚本内容')"))
    if (i < 0) return
    L.splice(i + 1, 0,
      "    /* P2: 另一条路由 /api/sources/import 有 2MB 上限，这条没有 —— 塞个 3MB 混淆脚本会卡死主线程 */",
      "    if (code.length > 2 * 1024 * 1024) throw new Error('脚本体过大（上限 2MB）')")
  })
  ok ? done.push('sources import 2MB') : miss.push('2MB')
}

/* ---------- 4. api-mobile 重复 remove + 死代码 ---------- */
{
  const ok = editLines('mobile/www/api-mobile.js', (L) => {
    /* 找第二个 action === 'remove' */
    const idxs = []
    L.forEach((l, i) => { if (l.includes("if (action === 'remove')")) idxs.push(i) })
    if (idxs.length < 2) return
    const second = idxs[1]
    /* 找到这个 if 块结束 */
    let d = 0
    let j = second
    for (; j < L.length; j++) {
      for (const ch of L[j]) { if (ch === '{') d++; else if (ch === '}') d-- }
      if (j > second && d === 0) break
    }
    L.splice(second, j - second + 1, '    /* P3: 这里原来有一份永不可达的 remove 重复实现，已删 */')
    done.push('删重复 remove')
  })
  if (!ok) miss.push('重复 remove')
}

/* ---------- 5+6. lx-engine-web 全局还原 ---------- */
{
  const f = 'mobile/www/lib/lx-engine-web.js'
  let s = fs.readFileSync(f, 'utf8')
  const a = `setTimeout(() => {
        if (settled && globalThis.lx === lx) globalThis.lx = prevLx
        try { if (typeof __prevBuffer !== 'undefined') globalThis.Buffer = __prevBuffer } catch (e) { }
      }, 100)`
  if (s.includes(a)) {
    s = s.replace(a, () => `/* P2: 原来的恢复逻辑有两个致命缺陷：
         1) 用 100ms 的一次性定时器，而脚本普遍是异步 send('inited')（>100ms），那时 settled 仍为 false → 永久跳过
         2) Buffer 的恢复被 typeof 判断卡死 —— 页面本来就没有 Buffer，__prevBuffer 必为 undefined，条件恒 false
         改到 finally 里无条件还原。 */`)
    /* 找到 init 的 finally，把还原放进去 */
    const fi = s.indexOf('finally {', s.indexOf('__prevConsole'))
    if (fi > 0) {
      const close = s.indexOf('}', fi)
      s = s.slice(0, close) + `
        /* P2: 无条件还原，且放在 finally 里（异步 init 也能覆盖） */
        try { if (globalThis.lx === lx) globalThis.lx = prevLx } catch (e1) { }
        try { globalThis.Buffer = prevBufferSnapshot } catch (e2) { }
        try { globalThis.console = __prevConsole } catch (e3) { }
      ` + s.slice(close)
      done.push('全局还原移到 finally')
    } else miss.push('finally 锚点')
  } else miss.push('lx-engine 恢复块')

  /* 需要 prevBufferSnapshot 变量 */
  if (!s.includes('prevBufferSnapshot')) {
    const anchor2 = 'const __prevBuffer = globalThis.Buffer'
    if (s.includes(anchor2)) {
      s = s.replace(anchor2, () => `const __prevBuffer = globalThis.Buffer
      const prevBufferSnapshot = globalThis.Buffer    /* P2: 无论原来有没有，都按原值还原 */`)
      done.push('加 prevBufferSnapshot')
    } else miss.push('__prevBuffer 锚点')
  }
  fs.writeFileSync(f, s, 'utf8')
}

/* ---------- 7. resolve 列表剔除 fish ---------- */
{
  const ok = editLines('mobile/www/lib/lx-engine-web.js', (L) => {
    const i = L.findIndex((l) => l.includes('const list = want.map((id) => this.scripts.get(id))'))
    if (i < 0) return
    L[i] = '    /* P3: fish 上面已经串行试过 3 次，这里再塞进并发竞速就是第 4 次调用 */\n' +
      '    const list = want.filter((id) => id !== \'fish\').map((id) => this.scripts.get(id))'
  })
  ok ? done.push('resolve 剔除 fish') : miss.push('fish')
}

console.log('=== F 批 ===')
done.forEach((d) => console.log('  ✓ ' + d))
if (miss.length) { console.log('未匹配:'); miss.forEach((m) => console.log('  ⚠ ' + m)) }