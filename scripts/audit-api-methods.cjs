'use strict'
/* 审计所有 api() 调用：写操作用的是 GET 还是 POST */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

const s = fs.readFileSync('public/app.js', 'utf8')
const lines = s.split('\n')

/* 写操作特征 */
const WRITE_RE = /[?&](set|open|remove|save|action|toggle|reload|id)=|\/api\/(shutdown|playlist|settings|sources|downloads)/

console.log('=== 所有 api() 调用 ===\n')
const problems = []

lines.forEach((l, i) => {
  const idx = l.indexOf('api(')
  if (idx < 0) return
  /* 排除 mobileApi( 之类 */
  if (idx > 0 && /[\w.]/.test(l[idx - 1])) return

  /* 提取第一个参数 */
  const rest = l.slice(idx + 4)
  let url = ''
  const q1 = rest[0]
  if (q1 === "'" || q1 === '"' || q1 === '`') {
    const end = rest.indexOf(q1, 1)
    if (end > 0) url = rest.slice(1, end)
  } else {
    return   /* 动态拼接的，跳过 */
  }
  if (!url.startsWith('/api/')) return

  /* 看同一行或后两行有没有 method: 'POST' */
  const ctx = lines.slice(i, i + 3).join(' ')
  const isPost = /method:\s*['"]POST['"]/.test(ctx)

  const isWrite = WRITE_RE.test(url)
  /* 读操作白名单 */
  const isRead = /\/api\/(health|lan|sources$|playlist$|downloads$|discover|toplist|search|lyric|url|stream|pic|db)/.test(url)
    && !/[?&](set|open|remove|save|action|toggle|reload)=/.test(url)

  let tag
  if (isWrite && !isRead) {
    tag = isPost ? '✓ POST' : '✗ 写操作却用 GET'
    if (!isPost) problems.push({ line: i + 1, url })
  } else {
    tag = '  GET(读)'
  }

  console.log('  L' + String(i + 1).padEnd(5) + tag.padEnd(16) + url.slice(0, 75))
})

console.log('\n=== 结论 ===')
if (problems.length === 0) {
  console.log('  ✓ 没有写操作用 GET 的')
} else {
  console.log('  ✗ 发现 ' + problems.length + ' 处:')
  problems.forEach((p) => console.log('    L' + p.line + ': ' + p.url))
}
