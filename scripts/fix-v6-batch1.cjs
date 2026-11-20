'use strict'
/* 第一批：P0 修复 */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

const done = []
const miss = []

/* ============ P0-1: dbRetry 未声明 ============ */
{
  const p = 'app/server.js'
  let s = fs.readFileSync(p, 'utf8')

  /* 1. 补声明 */
  const anchor = `let dbDirty = false
let dbFirstDirtyAt = 0`
  if (s.includes(anchor) && !/let dbRetry/.test(s)) {
    s = s.replace(anchor, () => `let dbDirty = false
let dbFirstDirtyAt = 0
/* P0: 指数退避的重试计数。之前只有赋值没有声明，
   'use strict' 下每次保存都会抛 ReferenceError，
   被当成写盘失败 → 重试逻辑永远不生效，磁盘上一直是旧值。 */
let dbRetry = 0`)
    done.push('P0-1a 补 let dbRetry = 0')
  } else if (/let dbRetry/.test(s)) {
    done.push('P0-1a dbRetry 已有声明')
  } else {
    miss.push('P0-1a 锚点')
  }

  /* 2. flushDb 整体包 try/catch，任何异常都不许逃出定时器 */
  const fdStart = s.indexOf('function flushDb (')
  if (fdStart > 0) {
    const bs = s.indexOf('{', fdStart)
    let d = 0
    let e = bs
    for (let k = bs; k < s.length; k++) {
      if (s[k] === '{') d++
      else if (s[k] === '}') { d--; if (d === 0) { e = k + 1; break } }
    }
    const body = s.slice(fdStart, e)
    if (!body.includes('/* guard */')) {
      /* 在外层包一层 IIFE 式的 try 太重，改成把函数体重命名 + 包一层 */
      const inner = body
        .replace(/^function flushDb \(\) \{/, 'function flushDbInner () {')
      const wrapper = `function flushDb () {
  /* guard: 这个函数唯一的常规调用点是 setTimeout 回调，
     任何异常逃出去都会变成 uncaughtException。
     内层已经自己处理了写盘失败，这里只是最后一道保险。 */
  try {
    flushDbInner()
  } catch (e) {
    try { console.error('[db] flushDb 异常（已兜住）:', e && e.message) } catch (e2) { }
    dbDirty = true
    if (!saveTimer) {
      try { saveTimer = setTimeout(flushDb, 5000) } catch (e3) { }
    }
  }
}
${inner}`
      s = s.slice(0, fdStart) + wrapper + s.slice(e)
      done.push('P0-1b flushDb 加外层 try/catch')
    } else {
      done.push('P0-1b flushDb 已有 guard')
    }
  } else {
    miss.push('P0-1b flushDb')
  }

  /* 3. 失败分支里 dbFirstDirtyAt 归零，让下次 saveDb 立刻写 */
  s = s.replace(`    dbDirty = true
    /* P3-6: 指数退避，别每 3 秒刷日志 */`, () => `    dbDirty = true
    /* 下次 saveDb 立刻尝试写，不要继续等 300ms 的合并窗口 */
    dbFirstDirtyAt = 0
    /* P3-6: 指数退避，别每 3 秒刷日志 */`)

  fs.writeFileSync(p, s, 'utf8')
}

/* ============ P0-3: sources/import 改 loadOne ============ */
{
  const p = 'app/server.js'
  let s = fs.readFileSync(p, 'utf8')
  const old = `    const file = sourceManager.install(name || 'imported-' + Date.now(), sourceCode)
    const id = file.replace(/\\.js$/i, '')
    await sourceManager.reload(id)`
  if (s.includes(old)) {
    s = s.replace(old, () => `    const file = sourceManager.install(name || 'imported-' + Date.now(), sourceCode)
    /* P1: install() 只写文件、不注册 entry，所以 reload(id) 必然抛「音源不存在」。
       新文件直接 loadOne，它会 init 并写进 entries。 */
    await sourceManager.loadOne(file)`)
    done.push('P0-3 sources/import 改用 loadOne')
  } else {
    const i = s.indexOf('sourceManager.install(')
    if (i > 0) {
      console.log('  P0-3 现场:')
      console.log(s.slice(i - 100, i + 260))
    }
    miss.push('P0-3 sources/import')
  }
  fs.writeFileSync(p, s, 'utf8')
}

console.log('=== 完成 ===')
done.forEach((d) => console.log('  ✓ ' + d))
if (miss.length) {
  console.log('\n=== 未处理 ===')
  miss.forEach((m) => console.log('  ⚠ ' + m))
}