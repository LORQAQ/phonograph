'use strict'
/* 找出所有可能为 null 的 innerHTML 赋值 */
const fs = require('node:fs')

const a = fs.readFileSync('public/app.js', 'utf8')
const html = fs.readFileSync('public/index.html', 'utf8')

/* HTML 里所有 id */
const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]))
console.log('HTML 定义 ' + ids.size + ' 个 id')

/* 找 $('...').innerHTML = 或 $('#x').innerHTML = */
console.log('\n=== innerHTML 赋值点 ===')
const lines = a.split('\n')
const risky = []
lines.forEach((l, i) => {
  const m = l.match(/\$\('#([\w-]+)'\)\.innerHTML\s*=/)
  if (m) {
    const id = m[1]
    const ok = ids.has(id)
    if (!ok) risky.push({ line: i + 1, id, text: l.trim().slice(0, 90) })
    console.log('  L' + (i + 1) + ' #' + id.padEnd(20) + (ok ? '✓' : '✗ 元素不存在'))
  }
  /* 也找 const x = $('#y') 然后 x.innerHTML */
  const m2 = l.match(/(?:const|let|var)\s+(\w+)\s*=\s*\$\('#([\w-]+)'\)/)
  if (m2 && !ids.has(m2[2])) {
    console.log('  L' + (i + 1) + ' 变量 ' + m2[1] + ' <- #' + m2[2] + ' ✗ 元素不存在')
  }
})

console.log('\n=== 高风险（元素不存在但直接赋值）===')
if (risky.length) {
  risky.forEach((r) => console.log('  L' + r.line + ' #' + r.id + '  ' + r.text))
} else {
  console.log('  无')
}

/* 找 .innerHTML 后面跟着变量名的情况（变量可能为 null） */
console.log('\n=== 变量形式的 innerHTML 赋值 ===')
lines.forEach((l, i) => {
  if (/^\s*[\w$.]+\.innerHTML\s*=/.test(l) && !l.includes("$('#")) {
    console.log('  L' + (i + 1) + ': ' + l.trim().slice(0, 100))
  }
})
