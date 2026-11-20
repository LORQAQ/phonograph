'use strict'
/* 找没有错误处理的 await api(...) */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

const s = fs.readFileSync('public/app.js', 'utf8')
const lines = s.split('\n')

console.log('================ await api() 错误处理审计 ================\n')

const issues = []
for (let i = 0; i < lines.length; i++) {
  const l = lines[i]
  if (!/await\s+api\s*\(/.test(l)) continue

  /* 判断是否被 try/catch 包裹：向上找最近的非空行，看是否是 try { */
  let guarded = false
  let depth = 0
  for (let k = i; k >= Math.max(0, i - 25); k--) {
    const t = lines[k].trim()
    if (/\btry\s*\{/.test(t)) { guarded = true; break }
    /* 遇到函数边界就停 */
    if (/^\s*(async\s+)?function\b/.test(t) || /=>\s*\{\s*$/.test(t)) break
  }
  /* 或者同行有 .catch */
  if (/\.catch\s*\(/.test(l)) guarded = true
  /* 或者同行赋值给变量且后面有 catch —— 简化：看后面 3 行 */
  if (!guarded) {
    for (let k = i + 1; k < Math.min(lines.length, i + 6); k++) {
      if (/\.catch\s*\(/.test(lines[k])) { guarded = true; break }
      if (/^\s*\}\s*catch/.test(lines[k])) { guarded = true; break }
    }
  }

  if (!guarded) issues.push({ n: i + 1, t: l.trim().slice(0, 120) })
}

console.log('未处理的 await api(): ' + issues.length + ' 处')
issues.forEach((x) => console.log('  L' + x.n + ': ' + x.t))

/* ---------- audio.play() 的错误处理 ---------- */
console.log('\n================ audio.play() 处理 ================\n')
const plays = []
lines.forEach((l, i) => {
  if (/audio\.play\s*\(/.test(l)) {
    const handled = /\.catch\s*\(|\.then\s*\(/.test(l)
    plays.push({ n: i + 1, handled, t: l.trim().slice(0, 110) })
  }
})
plays.forEach((p) => console.log('  ' + (p.handled ? '✓' : '✗ 未处理') + '  L' + p.n + ': ' + p.t))

/* ---------- async 函数里没用 try 的 ---------- */
console.log('\n================ async 函数块大小 ================\n')
const fns = []
lines.forEach((l, i) => {
  const m = l.match(/^\s*(?:async\s+function|const\s+\w+\s*=\s*async)/)
  if (m) fns.push({ n: i + 1, t: l.trim().slice(0, 90) })
})
console.log('  async 函数: ' + fns.length + ' 个')

/* ---------- 全局状态上限 ---------- */
console.log('\n================ 全局状态上限 ================\n')
const STATES = ['state.recent', 'state.downloads', 'state.history', 'state.results', 'state.queue', 'state.playlists']
for (const st of STATES) {
  const idx = lines.findIndex((l) => l.includes(st + ' =') || l.includes(st + '.push'))
  let found = false
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(st) && /slice\(0,|\.length\s*=\s*\d+|shift\(\)|splice\(/.test(lines[i])) {
      console.log('  ✓ ' + st + ' 有上限  L' + (i + 1) + ': ' + lines[i].trim().slice(0, 90))
      found = true
      break
    }
  }
  if (!found) console.log('  ⚠ ' + st + ' 没找到上限')
}