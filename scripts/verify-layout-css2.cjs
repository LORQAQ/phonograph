'use strict'
/**
 * 用一个能正确处理 @media（含单行块）的解析器，
 * 求「.deck 在给定宽度下的最终 display」
 */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

const css = fs.readFileSync('public/style.css', 'utf8')

/* ---- 极简但正确的 CSS 解析：产出 [{media, sel, decls, order}] ---- */
function parse (src) {
  const out = []
  let i = 0
  let order = 0

  function skipComment () {
    if (src.startsWith('/*', i)) {
      const e = src.indexOf('*/', i + 2)
      i = e < 0 ? src.length : e + 2
      return true
    }
    return false
  }

  /* 读一个块的内容（到匹配的 }），返回 {body, next} */
  function readBlock (start) {
    let d = 0
    let j = start
    while (j < src.length) {
      if (src.startsWith('/*', j)) { const e = src.indexOf('*/', j + 2); j = e < 0 ? src.length : e + 2; continue }
      if (src[j] === '{') d++
      else if (src[j] === '}') { d--; if (d === 0) return { body: src.slice(start + 1, j), end: j + 1 } }
      j++
    }
    return { body: src.slice(start + 1), end: src.length }
  }

  let media = null
  let buf = ''
  while (i < src.length) {
    if (skipComment()) continue
    const ch = src[i]

    if (ch === '@') {
      /* @media ... { ... } */
      const brace = src.indexOf('{', i)
      if (brace < 0) break
      const head = src.slice(i, brace).trim()
      if (/^@media/.test(head)) {
        const { body, end } = readBlock(brace)
        /* 递归处理里面的规则，带上 media 条件 */
        const inner = parseInto(body, head)
        out.push(...inner)
        i = end
        continue
      }
      /* 其它 at-rule（@font-face/@keyframes）整块跳过 */
      const { end } = readBlock(brace)
      i = end
      continue
    }

    if (ch === '{') {
      const sel = buf.trim()
      const { body, end } = readBlock(i)
      if (sel) { out.push({ sel: sel.replace(/\s+/g, ' '), body, order: order++ }) }
      buf = ''
      i = end
      continue
    }
    if (ch === '}') { buf = ''; i++; continue }
    buf += ch
    i++
  }
  return out
}

function parseInto (src, media) {
  const out = []
  let i = 0
  let order = 0
  let buf = ''
  function readBlock (start) {
    let d = 0
    let j = start
    while (j < src.length) {
      if (src.startsWith('/*', j)) { const e = src.indexOf('*/', j + 2); j = e < 0 ? src.length : e + 2; continue }
      if (src[j] === '{') d++
      else if (src[j] === '}') { d--; if (d === 0) return { body: src.slice(start + 1, j), end: j + 1 } }
      j++
    }
    return { body: src.slice(start + 1), end: src.length }
  }
  while (i < src.length) {
    if (src.startsWith('/*', i)) { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; continue }
    const ch = src[i]
    if (ch === '{') {
      const sel = buf.trim()
      const { body, end } = readBlock(i)
      if (sel) out.push({ sel: sel.replace(/\s+/g, ' '), body, media, order: order++ })
      buf = ''
      i = end
      continue
    }
    if (ch === '}') { buf = ''; i++; continue }
    buf += ch
    i++
  }
  return out
}

const rules = parse(css)

function mediaMatches (m, w) {
  if (!m) return true
  /* 支持 max-width / min-width，逗号 = or */
  for (const part of m.replace(/^@media\s*/, '').split(',')) {
    let ok = true
    const mx = part.match(/max-width:\s*(\d+)px/)
    const mn = part.match(/min-width:\s*(\d+)px/)
    const mxh = part.match(/max-height:\s*(\d+)px/)
    const mnh = part.match(/min-height:\s*(\d+)px/)
    if (mx && w > Number(mx[1])) ok = false
    if (mn && w < Number(mn[1])) ok = false
    /* 高度条件这里按 1000px 估（桌面常见） */
    if (mxh && 1000 > Number(mxh[1])) ok = false
    if (mnh && 1000 < Number(mnh[1])) ok = false
    if (ok) return true
  }
  return false
}

function displayOfDeck (w) {
  let val = '(未设置)'
  let from = ''
  for (const r of rules) {
    if (!mediaMatches(r.media, w)) continue
    const sels = r.sel.split(',').map((s) => s.trim())
    for (const s of sels) {
      if (s !== '.deck' && s !== 'body.m-deck .deck') continue
      const m = r.body.match(/display\s*:\s*([a-z-]+)/)
      if (m) { val = m[1]; from = s + (r.media ? '  [' + r.media + ']' : '  [无 media]') }
    }
  }
  return { val, from }
}

console.log('=== .deck 的最终 display（未开全屏播放页）===')
let bad = 0
for (const w of [400, 600, 670, 800, 860, 861, 900, 1100, 1600]) {
  const { val, from } = displayOfDeck(w)
  const shouldHide = w <= 860
  const ok = shouldHide ? val === 'none' : val !== 'none'
  if (!ok) bad++
  console.log('  ' + String(w).padStart(5) + 'px → ' + val.padEnd(8) + (ok ? '✓' : '✗') + '   来自 ' + from)
}

console.log('\n=== 对照：修复前那种「文件末尾无条件 .deck{display:flex}」会怎样 ===')
const fake = rules.concat([{ sel: '.deck', body: ' display:flex; flex-direction:column;', media: null, order: 9999 }])
{
  let val = '(未设置)'
  for (const r of fake) {
    if (!mediaMatches(r.media, 670)) continue
    if (r.sel.split(',').map((s) => s.trim()).includes('.deck')) {
      const m = r.body.match(/display\s*:\s*([a-z-]+)/)
      if (m) val = m[1]
    }
  }
  console.log('  670px → ' + val + (val === 'flex' ? '  （这就是你截图里的样子：右侧面板不隐藏，布局挤在一起）' : ''))
}

console.log('\n' + (bad ? '✗ ' + bad + ' 个宽度不通过' : '✓ 全部通过'))
if (bad) process.exitCode = 1