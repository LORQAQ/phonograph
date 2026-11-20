'use strict'
/* 给三个 async 渲染函数加视图令牌守卫（用行号定位，避免模板串转义问题） */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

const p = 'public/app.js'
const lines = fs.readFileSync(p, 'utf8').split('\n')
const done = []
const miss = []

/** 在函数体开头插入 `const __vt = __viewToken` */
function addTokenAt (fnName) {
  const i = lines.findIndex((l) => l.includes('function ' + fnName + ' ('))
  if (i < 0) { miss.push(fnName + ' 未找到'); return -1 }
  /* 找函数体的第一个有效语句之后插入 */
  let j = i
  /* 跳过注释行，找到第一条真实语句 */
  for (; j < Math.min(i + 30, lines.length); j++) {
    const t = lines[j].trim()
    if (!t || t.startsWith('/*') || t.startsWith('*') || t.startsWith('//')) continue
    if (j === i) continue
    break
  }
  lines.splice(j, 0, '  const __vt = __viewToken    /* P1: 视图令牌，回来时校验是否还该渲染 */')
  done.push(fnName + ' 插入令牌捕获')
  return j
}

/** 在指定函数的 await 之后插入守卫 */
function addGuardAfter (fnName, awaitNeedle, guardExpr) {
  const i = lines.findIndex((l) => l.includes('function ' + fnName + ' ('))
  if (i < 0) return
  for (let k = i; k < Math.min(i + 60, lines.length); k++) {
    if (lines[k].includes(awaitNeedle)) {
      lines.splice(k + 1, 0, '    ' + guardExpr)
      done.push(fnName + ' 加守卫')
      return
    }
  }
  miss.push(fnName + ' 找不到 await ' + awaitNeedle)
}

/* ---------- renderDownloadsView ---------- */
addTokenAt('renderDownloadsView')
addGuardAfter('renderDownloadsView', "await api('/api/downloads')",
  "if (__vt !== __viewToken || state.view !== 'downloads') return")

/* ---------- renderLeaderboard ---------- */
addTokenAt('renderLeaderboard')
addGuardAfter('renderLeaderboard', "await api('/api/toplist?type='",
  "if (__vt !== __viewToken || state.view !== 'leaderboard') return")

/* ---------- loadRecPage ---------- */
addTokenAt('loadRecPage')
addGuardAfter('loadRecPage', 'await api(',
  "if (__vt !== __viewToken) return")

fs.writeFileSync(p, lines.join('\n'), 'utf8')

console.log('=== 完成 ===')
done.forEach((d) => console.log('  ✓ ' + d))
if (miss.length) {
  console.log('\n=== 未处理 ===')
  miss.forEach((m) => console.log('  ⚠ ' + m))
}