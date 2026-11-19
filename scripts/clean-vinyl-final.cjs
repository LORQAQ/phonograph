'use strict'
/* 最后两条残留：固定 height 规则 + 我加的 max-height:100% */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

for (const f of ['public/style.css', 'mobile/www/style.css']) {
  if (!fs.existsSync(f)) continue
  let c = fs.readFileSync(f, 'utf8')
  const orig = c

  /* 1) 删掉 height:min(46vh,420px) 这种固定高度的规则（和 max-width 方案互相打架） */
  c = c.replace(
    /\.vinyl-zone\s*\{\s*width:\s*auto;\s*height:\s*min\([^)]*\);\s*aspect-ratio:\s*1\/1;\s*\}/g,
    '/* removed: 固定 height 会和 max-width 方案冲突 */'
  )
  c = c.replace(
    /\.vinyl-zone\s*\{\s*height:\s*min\([^)]*\);[^}]*\}/g,
    '/* removed: 固定 height */'
  )

  /* 2) 我加的 max-height:100% 会把子元素压扁 —— 只留 max-width */
  c = c.replace(
    /\.vinyl-zone \.vinyl,\s*\n?\.vinyl-zone \.plinth,\s*\n?\.vinyl-zone \.tonearm\{\s*max-width:100%;\s*max-height:100%;\s*\}/g,
    `.vinyl-zone .vinyl,
.vinyl-zone .plinth,
.vinyl-zone .tonearm{
  max-width:100%;
  /* 不要写 max-height:100% —— 父容器一旦不是正方形就会把唱片压扁 */
}`
  )
  /* 万一格式不同再来一次 */
  c = c.replace(/max-width:100%;\s*max-height:100%;/g, 'max-width:100%;')

  if (c !== orig) {
    fs.writeFileSync(f, c, 'utf8')
    console.log(f + ': ✓ 已清理')
  } else {
    console.log(f + ': 无变化')
  }
}

/* 最终检查 */
console.log('\n=== 最终 .vinyl-zone 生效规则 ===')
const c1 = fs.readFileSync('public/style.css', 'utf8')
const stripped = c1.replace(/\/\*[\s\S]*?\*\//g, '')
const re = /\.vinyl-zone[^{,]*\{[^}]*\}/g
let m
let n = 0
while ((m = re.exec(stripped))) {
  n++
  console.log('  ' + n + '. ' + m[0].replace(/\s+/g, ' ').slice(0, 150))
}

console.log('\n=== 冲突检查 ===')
const hasFixedH = /\.vinyl-zone\s*\{[^}]*[^-]height:\s*min\([^}]*\}/.test(stripped)
const hasMaxH = /\.vinyl-zone\s*\{[^}]*max-height[^}]*\}/.test(stripped)
console.log('  固定 height 规则: ' + (hasFixedH ? '✗ 还有' : '✓ 已清'))
console.log('  max-height 规则: ' + (hasMaxH ? '✗ 还有' : '✓ 已清'))
console.log('  aspect-ratio:1/1 在: ' + (/\.vinyl-zone\s*\{[^}]*aspect-ratio:1\/1/.test(stripped) ? '✓' : '✗'))
console.log('  max-width:min(100%,Nvh): ' + (/max-width:min\(100%,\s*\d+vh/.test(stripped) ? '✓' : '✗'))
