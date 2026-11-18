'use strict'
/* 找右上角那个孤零零的 ? */
const fs = require('node:fs')
const html = fs.readFileSync('mobile/www/index.html', 'utf8')
const css = fs.readFileSync('mobile/www/style.css', 'utf8')

console.log('=== HTML 所有含 ? 的行（排除 URL 参数）===')
html.split('\n').forEach((l, i) => {
  if (l.includes('?') && !/\?v=|share|api\/|\?id=|&/.test(l)) {
    console.log('L' + (i + 1) + ': ' + l.trim().slice(0, 140))
  }
})

console.log('\n=== 检查 __errBar 相关 ===')
const eb = html.indexOf('__errBar')
if (eb > 0) console.log(html.slice(Math.max(0, eb - 300), eb + 400))

console.log('\n=== 检查所有空 svg use（symbol 存在但可能空）===')
const uses = [...html.matchAll(/<use href="#([^"]+)"/g)].map((m) => m[1])
const uniq = [...new Set(uses)]
console.log('引用 ' + uniq.length + ' 个 symbol: ' + uniq.join(', '))

const symbols = [...html.matchAll(/<symbol[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/symbol>/g)]
console.log('\n定义 ' + symbols.length + ' 个 symbol')
const empty = symbols.filter((m) => !m[2].trim())
if (empty.length) {
  console.log('空 symbol: ' + empty.map((m) => m[1]).join(', '))
} else {
  console.log('没有空 symbol')
}

/* 未定义的引用 */
const defined = new Set(symbols.map((m) => m[1]))
const missing = uniq.filter((u) => !defined.has(u))
console.log('\n未定义的 symbol 引用: ' + (missing.length ? missing.join(', ') : '无'))

console.log('\n=== CSS 里带 content 的规则 ===')
const contents = [...css.matchAll(/content\s*:\s*([^;}]+)/g)]
contents.slice(0, 20).forEach((m) => console.log('  content: ' + m[1].trim().slice(0, 60)))
