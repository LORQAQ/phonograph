'use strict'
/* 给缺失元素的 innerHTML 赋值加保护（元素不在 HTML 里，直接赋值会抛错） */
const fs = require('node:fs')
const p = 'public/app.js'
let a = fs.readFileSync(p, 'utf8')
const html = fs.readFileSync('public/index.html', 'utf8')

const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]))

/* 找所有 $('#xxx').innerHTML = ... 形式，元素不在 HTML 的加保护 */
const lines = a.split('\n')
let fixed = 0
for (let i = 0; i < lines.length; i++) {
  const l = lines[i]
  const m = l.match(/^(\s*)(\$\('#([\w-]+)'\)\.innerHTML\s*=)/)
  if (!m) continue
  const id = m[3]
  if (ids.has(id)) continue

  const indent = m[1]
  /* 整行包进 if */
  const newLine = indent + 'if ($(\'#' + id + '\')) ' + l.trim()
  lines[i] = newLine
  fixed++
  console.log('L' + (i + 1) + ' #' + id + ' 已加保护')
}
a = lines.join('\n')

/* 变量形式：const x = $('#y') 之后的 x.innerHTML，改成 const x = $('#y') || { innerHTML: '', style: {}, textContent: '', classList: { add(){}, remove(){}, toggle(){} }, value: '', addEventListener(){} } */
const varPattern = /(?:const|let)\s+(\w+)\s*=\s*\$\('#([\w-]+)'\)(?!\s*\|\|)/g
a = a.replace(varPattern, (match, vname, id) => {
  if (ids.has(id)) return match
  console.log('变量 ' + vname + ' <- #' + id + ' 已加 fallback')
  fixed++
  return `const ${vname} = $('#${id}') || { innerHTML: '', textContent: '', style: {}, value: '', classList: { add () {}, remove () {}, toggle () {} }, addEventListener () {}, appendChild () {}, querySelector () { return null }, querySelectorAll () { return [] }, setAttribute () {} }`
})

fs.writeFileSync(p, a, 'utf8')
console.log('\n共修复 ' + fixed + ' 处')
