'use strict'
/* 看窄屏媒体查询里顶栏/搜索框怎么排的，以及 ? 从哪来 */
const fs = require('node:fs')

const css = fs.readFileSync('public/style.css', 'utf8')
const html = fs.readFileSync('public/index.html', 'utf8')

/* 提取所有 @media 块 */
const mqBlocks = []
let idx = 0
while (true) {
  const at = css.indexOf('@media', idx)
  if (at < 0) break
  /* 找到匹配的右括号 */
  const open = css.indexOf('{', at)
  if (open < 0) break
  let depth = 0
  let end = open
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}') { depth--; if (depth === 0) { end = i; break } }
  }
  mqBlocks.push({
    head: css.slice(at, open).trim(),
    body: css.slice(open + 1, end),
  })
  idx = end + 1
}

console.log('=== 媒体查询 ' + mqBlocks.length + ' 个 ===')
for (const b of mqBlocks) {
  console.log('\n--- ' + b.head + ' ---')
  const rules = b.body.split('}').filter((r) => r.trim())
  for (const r of rules.slice(0, 25)) {
    const t = r.replace(/\s+/g, ' ').trim()
    if (t) console.log('  ' + t.slice(0, 130))
  }
}

console.log('\n=== HTML 里的 ? 字符 ===')
const lines = html.split('\n')
lines.forEach((l, i) => {
  if (/\>\s*\?\s*\<|\?\s*<\/|\>\?/.test(l)) {
    console.log((i + 1) + ': ' + l.trim().slice(0, 120))
  }
})

console.log('\n=== 可能显示 ? 的元素 ===')
const cands = [...html.matchAll(/<([a-z]+)[^>]*id="([^"]+)"[^>]*>([^<]{0,10})/g)]
for (const m of cands) {
  if (m[3].includes('?')) console.log('  #' + m[2] + ' -> "' + m[3].trim() + '"')
}
