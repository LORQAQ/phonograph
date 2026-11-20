'use strict'
/* 第 6 轮审查：静态交叉核对（只读，不改源码） */
const fs = require('node:fs')
const path = require('node:path')
const ROOT = path.resolve(__dirname, '..')
const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8')
const app = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8')
const css = fs.readFileSync(path.join(ROOT, 'public/style.css'), 'utf8')

const lineOf = (src, idx) => src.slice(0, idx).split('\n').length

/* ---------- 1. HTML 里的静态 id ---------- */
const htmlIds = new Map()
{
  const re = /\bid="([^"]+)"/g
  let m
  while ((m = re.exec(html))) htmlIds.set(m[1], lineOf(html, m.index))
}

/* ---------- 2. app.js 里通过 innerHTML 动态生成的 id ---------- */
const dynIds = new Map()
{
  const re = /\bid="([^"$<>{}]+)"/g
  let m
  while ((m = re.exec(app))) dynIds.set(m[1], lineOf(app, m.index))
}

/* ---------- 3. app.js 里 $('#x') 引用 ---------- */
const refs = []
{
  const re = /\$\(\s*'#([A-Za-z0-9_-]+)'\s*\)/g
  let m
  while ((m = re.exec(app))) refs.push({ id: m[1], line: lineOf(app, m.index) })
}

const missing = []
const seen = new Set()
for (const r of refs) {
  if (htmlIds.has(r.id) || dynIds.has(r.id)) continue
  const k = r.id
  if (seen.has(k)) { const p = missing.find((x) => x.id === k); p.lines.push(r.line); continue }
  seen.add(k)
  missing.push({ id: k, lines: [r.line] })
}

console.log('== HTML 静态 id: ' + htmlIds.size + ' | app.js 模板生成 id: ' + dynIds.size + ' | $("#id") 引用: ' + refs.length)
console.log('\n== 引用了但 HTML 和模板里都不存在的 id ==')
for (const m of missing) console.log('  #' + m.id + '  @app.js:' + m.lines.join(','))

/* HTML 里有、但 app.js 从不 $('#x') 引用、且没有 data-* 绑定的按钮 */
const boundByData = new Set()
{
  const re = /dataset\.([A-Za-z0-9_]+)/g
  let m
  while ((m = re.exec(app))) boundByData.add(m[1])
}
const unusedHtmlIds = []
for (const [id, line] of htmlIds) {
  if (refs.some((r) => r.id === id)) continue
  unusedHtmlIds.push(id + ':' + line)
}
console.log('\n== HTML 有 id 但 app.js 无 $("#id") 引用（可能靠 dataset/父级事件） ==')
console.log('  ' + unusedHtmlIds.join(', '))

/* ---------- 4. innerHTML 模板里没有 esc() 的插值 ---------- */
console.log('\n== innerHTML 赋值里的裸插值（未 esc） ==')
const escCtx = []
{
  const re = /\.innerHTML\s*=\s*/g
  let m
  while ((m = re.exec(app))) {
    const start = m.index + m[0].length
    /* 取到语句结束（配平括号/引号，粗略截止到行尾 + 续行） */
    let i = start
    let depth = 0
    let quote = null
    for (; i < app.length; i++) {
      const c = app[i]
      if (quote) {
        if (c === '\\') { i++; continue }
        if (c === quote) quote = null
        continue
      }
      if (c === "'" || c === '"' || c === '`') { quote = c; continue }
      if (c === '(' || c === '[' || c === '{') depth++
      else if (c === ')' || c === ']' || c === '}') { if (depth === 0) break; depth-- }
      else if (c === '\n' && depth === 0) break
    }
    const expr = app.slice(start, i)
    const segs = expr.split(/\$\{/)
    for (let s = 1; s < segs.length; s++) {
      /* 取该插值表达式到匹配的 } */
      let d = 1; let j = 0
      for (; j < segs[s].length && d > 0; j++) {
        if (segs[s][j] === '{') d++
        else if (segs[s][j] === '}') { d--; if (d === 0) break }
      }
      const e = segs[s].slice(0, j)
      const tagLine = lineOf(app, start)
      const okEsc = /esc\(|svg\(|fmtTime\(|fmtCount\(|String\(|Number\(|\.length|i \+ 1|encodeURIComponent\(|\?\s*''\s*:\s*''/.test(e) ||
        /^\s*['"]?\s*$/.test(e) ||
        /^\s*(i|n|d|f|s|x|p)\.(size|mtime|ms|count|play|songs\.length)/.test(e) ||
        /\?\s*'ok'\s*:\s*'err'|\?\s*''\s*:\s*'paused'|playing \?/.test(e)
      if (!okEsc) escCtx.push({ line: tagLine, expr: e.trim() })
    }
  }
}
for (const c of escCtx) console.log('  app.js:' + c.line + '  ${' + c.expr + '}')

/* ---------- 5. await 是否在 try 内（按最近函数体粗略判断） ---------- */
console.log('\n== await 位置（人工核对 catch 覆盖） ==')
{
  const lines = app.split('\n')
  lines.forEach((l, i) => { if (/\bawait\b/.test(l)) console.log('  ' + (i + 1) + ': ' + l.trim().slice(0, 120)) })
}

/* ---------- 6. 常量集中度 ---------- */
console.log('\n== 版本号/常量分散检查 ==')
const verHits = []
{
  const re = /1\.0\.\d+/g
  let m
  while ((m = re.exec(app))) verHits.push('app.js:' + lineOf(app, m.index) + ' ' + m[0])
  while ((m = re.exec(html))) verHits.push('index.html:' + lineOf(html, m.index) + ' ' + m[0])
}
console.log('  ' + verHits.join(' | '))

/* ---------- 7. CSS 选择器 vs 真实 class ---------- */
console.log('\n== CSS 里出现但 HTML/JS 中不存在的 class ==')
{
  const htmlAndJs = html + '\n' + app
  const cls = new Set()
  const re = /\.([A-Za-z][A-Za-z0-9_-]{1,})/g
  let m
  while ((m = re.exec(css))) cls.add(m[1])
  const dead = []
  for (const c of cls) {
    if (/^\d/.test(c)) continue
    const inHtml = htmlAndJs.includes('"' + c + '"') || htmlAndJs.includes(' ' + c + ' ') ||
      htmlAndJs.includes('class="' + c) || htmlAndJs.includes('classList.add(\'' + c + '\')') ||
      app.includes("'" + c + "'") || app.includes('"' + c + '"') ||
      htmlAndJs.includes(c + '"') || htmlAndJs.includes("'" + c + "'")
    if (!inHtml) dead.push(c)
  }
  console.log('  ' + dead.join(', '))
}

/* ---------- 8. app.js vs mobile/www/app.js ---------- */
console.log('\n== public/app.js vs mobile/www/app.js ==')
const mob = fs.readFileSync(path.join(ROOT, 'mobile/www/app.js'), 'utf8')
const al = app.split('\n'); const ml = mob.split('\n')
console.log('  行数 public=' + al.length + ' mobile=' + ml.length)
let diff = 0
const max = Math.max(al.length, ml.length)
for (let i = 0; i < max; i++) if ((al[i] || '') !== (ml[i] || '')) diff++
console.log('  逐行不同的行数=' + diff)