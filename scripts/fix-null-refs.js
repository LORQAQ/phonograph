'use strict'
/* 彻底清理：所有对已删除元素的直接属性访问都加存在性判断 */
const fs = require('node:fs')
const p = 'public/app.js'
let s = fs.readFileSync(p, 'utf8')

/* 1) const xxx = $('#missing') 后紧跟使用 → 改成可选链/短路 */
const lines = s.split('\n')
const MISSING = ['volNum', 'srcBadge', 'srcStatus', 'lrcOffsetTip', 'btnLrcBigger', 'btnLrcSmaller', 'btnLrcPlus', 'btnLrcMinus', 'btnNewPlaylist']

let fixed = 0
for (let i = 0; i < lines.length; i++) {
  for (const id of MISSING) {
    const sel = "$('#" + id + "')"
    if (!lines[i].includes(sel)) continue
    /* 已经加了 if 判断的跳过 */
    if (/if\s*\(\s*\$\(/.test(lines[i])) continue

    /* 形如：  const num = $('#volNum')  → 加 fallback */
    if (/^\s*(const|let|var)\s+\w+\s*=\s*\$\(/.test(lines[i])) {
      lines[i] = lines[i].replace(sel, sel + " || { textContent: '', style: {}, classList: { add () {}, remove () {}, toggle () {} }, value: '', addEventListener () {} }")
      fixed++
      continue
    }
    /* 形如：  $('#lrcOffsetTip').textContent = ...  → 短路 */
    if (/^\s*\$\(/.test(lines[i])) {
      lines[i] = lines[i].replace(/^(\s*)\$\(/, '$1$(' + "'#" + id + "'" + ') && $(')
      fixed++
      continue
    }
  }
}

s = lines.join('\n')

/* 2) updateOffsetTip 整体加保护 */
s = s.replace(
  /function updateOffsetTip \(\) \{[^}]*\}/,
  "function updateOffsetTip () { const el = $('#lrcOffsetTip'); if (!el) return; el.textContent = '偏移 ' + (state.lrcOffset || 0).toFixed(1) + 's' }"
)

fs.writeFileSync(p, s, 'utf8')
console.log('已处理', fixed, '处')

/* 3) 静态检查：还有多少裸的 $('#缺失').xxx */
const html = fs.readFileSync('public/index.html', 'utf8')
const ids = new Set()
for (const m of html.matchAll(/id="([^"]+)"/g)) ids.add(m[1])
for (const m of s.matchAll(/id="([^"]+)"/g)) ids.add(m[1])

const bad = []
const re = /\$\('#([A-Za-z0-9_-]+)'\)\.([A-Za-z]+)/g
let m2
while ((m2 = re.exec(s))) {
  const before = s.slice(Math.max(0, m2.index - 60), m2.index)
  if (before.includes('||')) continue          /* 有 fallback */
  if (before.includes('if (')) continue        /* 有判断 */
  if (before.includes(') && $(')) continue     /* 短路 */
  if (!ids.has(m2[1])) {
    const line = s.slice(0, m2.index).split('\n').length
    bad.push('#' + m2[1] + '.' + m2[2] + ' (L' + line + ')')
  }
}
console.log('仍有裸访问:', bad.length ? bad.join(', ') : '无')
