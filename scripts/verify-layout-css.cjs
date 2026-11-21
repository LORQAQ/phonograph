'use strict'
/* 用真实 CSS 逻辑验证：窄宽度下 .deck 是否被隐藏 */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

const css = fs.readFileSync('public/style.css', 'utf8')

/* 极简 CSS 求值：
   - 收集所有 `.deck` 选择器的 display 声明（含 @media 条件）
   - 按「后出现者胜、同特异性」的规则算出给定宽度下的最终 display */
function parseBlocks (src) {
  const out = []
  let i = 0
  let media = null
  let depth = 0
  let buf = ''
  let mediaBuf = ''
  const stack = []
  while (i < src.length) {
    const ch = src[i]
    if (src.startsWith('/*', i)) { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; continue }
    if (ch === '@' && src.startsWith('@media', i)) {
      const brace = src.indexOf('{', i)
      mediaBuf = src.slice(i, brace).trim()
      stack.push(mediaBuf)
      i = brace + 1
      continue
    }
    if (ch === '{') {
      const sel = buf.trim()
      const braceEnd = findClose(src, i)
      const body = src.slice(i + 1, braceEnd)
      out.push({ media: stack.length ? stack[stack.length - 1] : null, sel, body })
      buf = ''
      i = braceEnd + 1
      if (stack.length && src[i] === '}') { stack.pop(); i++ }
      continue
    }
    if (ch === '}') { stack.pop(); buf = ''; i++; continue }
    buf += ch
    i++
  }
  return out
}

function findClose (src, openIdx) {
  let d = 0
  for (let i = openIdx; i < src.length; i++) {
    if (src.startsWith('/*', i)) { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 1; continue }
    if (src[i] === '{') d++
    else if (src[i] === '}') { d--; if (d === 0) return i }
  }
  return src.length
}

function mediaMatches (m, w) {
  if (!m) return true
  const mw = m.match(/max-width:\s*(\d+)px/)
  const mn = m.match(/min-width:\s*(\d+)px/)
  if (mw && !(w <= Number(mw[1]))) return false
  if (mn && !(w >= Number(mn[1]))) return false
  return true
}

const blocks = parseBlocks(css)

function displayOfDeck (w) {
  let result = 'block'
  for (const b of blocks) {
    if (!mediaMatches(b.media, w)) continue
    const sels = b.sel.split(',').map((s) => s.trim())
    /* 只看精确命中 .deck 或 body.m-deck .deck 的规则 */
    for (const s of sels) {
      if (s === '.deck') {
        const m = b.body.match(/display\s*:\s*([a-z-]+)/)
        if (m) result = m[1]
      }
      /* body.m-deck .deck 表示"打开全屏播放页"，这种情况下应显示 */
      if (s === 'body.m-deck .deck') {
        const m = b.body.match(/display\s*:\s*([a-z-]+)/)
        if (m) result = m[1]
      }
    }
  }
  return result
}

console.log('=== 各种宽度下 .deck 的最终 display（未开全屏播放页时）===')
let bad = 0
for (const w of [400, 600, 670, 800, 860, 870, 980, 1180, 1600]) {
  const d = displayOfDeck(w)
  const shouldHide = w <= 860
  const ok = shouldHide ? (d === 'none') : (d !== 'none')
  if (!ok) bad++
  console.log('  ' + String(w).padStart(5) + 'px → display:' + d.padEnd(6) +
    (ok ? '  ✓' : '  ✗ 应该是 ' + (shouldHide ? 'none' : 'flex')))
}

console.log('\n=== 嵌套注释检查 ===')
const badComment = /[^\s{][ \t]*\/\*/m.test(css.split('\n').filter((l) => l.includes('/*') && !l.trim().startsWith('/*') && !l.includes('*/')).join('\n'))
const inline = css.split('\n').filter((l, i) => {
  const t = l.trim()
  if (t.startsWith('/*') || t.startsWith('*') || t.includes('*/')) return false
  return l.includes('/*')
})
if (inline.length) { console.log('  ✗ 有注释写在选择器后面：'); inline.slice(0, 5).forEach((l) => console.log('     ' + l.trim())) }
else console.log('  ✓ 没有注释夹在两条选择器之间')

console.log('\n' + (bad ? '✗ ' + bad + ' 个宽度不通过' : '✓ 全部通过'))
if (bad) process.exitCode = 1