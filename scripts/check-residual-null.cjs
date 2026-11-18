'use strict'
/* 检查 app.js 里还有哪些 $('#x') 变量没有 fallback 且元素不存在 */
const fs = require('node:fs')

const s = fs.readFileSync('public/app.js', 'utf8')
const html = fs.readFileSync('public/index.html', 'utf8')
const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]))

console.log('HTML 有 ' + ids.size + ' 个 id')

const lines = s.split('\n')
let noFallback = 0
let guarded = 0

lines.forEach((l, i) => {
  /* const x = $('#y')  后面没有 || */
  const m = l.match(/(?:const|let)\s+(\w+)\s*=\s*\$\('#([\w-]+)'\)(?!\s*\|\|)/)
  if (!m) return
  const [, vname, id] = m
  if (ids.has(id)) return
  noFallback++
  console.log('  L' + (i + 1) + '  ' + vname + ' <- #' + id + '  ✗ 无 fallback')
})

/* 统计已加 fallback 的 */
const fb = s.match(/\$\('#[\w-]+'\)\s*\|\|\s*\{/g)
console.log('\n已有 fallback: ' + (fb ? fb.length : 0) + ' 处')
console.log('仍无 fallback: ' + noFallback + ' 处')

/* 检查直接 .innerHTML 赋值（$('#x').innerHTML） */
console.log('\n=== 直接 innerHTML 赋值 ===')
let direct = 0
lines.forEach((l, i) => {
  const m = l.match(/\$\('#([\w-]+)'\)\.innerHTML\s*=/)
  if (!m) return
  if (ids.has(m[1])) return
  const hasIf = l.includes('if (') || l.trim().startsWith('if')
  direct++
  console.log('  L' + (i + 1) + '  #' + m[1] + '  ' + (hasIf ? '✓已保护' : '✗未保护'))
})
console.log('直接赋值缺失元素: ' + direct + ' 处')
