'use strict'
/* 逐条清掉残留的旧 .vinyl-zone 尺寸规则 */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

/* 这些都是历史遗留的，全部换成注释 */
const DEAD = [
  '  aspect-ratio:1/1;\n  width:100%;\n  max-width:100%;\n  /* 竖向空间最多占 46vh，且不超过 420px */\n  max-height:min(46vh,420px);\n  margin:0 auto;\n}',
  '  width:auto;\n  height:min(46vh,420px);\n  aspect-ratio:1/1;\n}',
  '  max-height:min(38vh,340px);\n  margin:0 auto;\n}',
  '  width:auto;\n  height:min(38vh,340px);\n  max-height:min(38vh,340px);\n  aspect-ratio:1/1;\n}',
  '  max-height:min(30vh,260px)}',
  '  max-height:min(32vh,280px)}',
  '  max-height:min(34vh,300px)}',
  '  max-height:min(28vh,240px)}',
]

for (const f of ['public/style.css', 'mobile/www/style.css']) {
  if (!fs.existsSync(f)) continue
  let c = fs.readFileSync(f, 'utf8')
  let cnt = 0

  for (const d of DEAD) {
    if (c.includes(d)) {
      c = c.split(d).join('  /* removed-legacy */\n}')
      cnt++
    }
  }

  /* 再用正则兜底清掉任何残留的裸 max-height / height 组合 */
  const before = c
  c = c.replace(/\.vinyl-zone\s*\{\s*[^}]*max-height\s*:[^}]*\}/g, (m) => {
    /* 只清 root 级的（不含 max-width:min(100%, 的） */
    if (m.includes('max-width:min(100%')) return m
    return '/* removed-legacy-height */'
  })

  fs.writeFileSync(f, c, 'utf8')
  console.log(f + ': 精确替换 ' + cnt + ' 条，正则兜底' + (before !== c ? ' ✓' : ' (无)'))
}

/* 最终确认 */
console.log('\n=== 最终 .vinyl-zone 生效规则 ===')
const c1 = fs.readFileSync('public/style.css', 'utf8')
const re = /\.vinyl-zone[^{]*\{[^}]*\}/g
let m
let n = 0
while ((m = re.exec(c1))) {
  const start = m.index
  const before = c1.lastIndexOf('/*', start)
  const closeBefore = c1.lastIndexOf('*/', start)
  if (before > closeBefore) continue   /* 在注释里，跳过 */
  n++
  console.log('  ' + n + '. ' + m[0].replace(/\s+/g, ' ').slice(0, 140))
}
console.log('\n生效规则数: ' + n)

/* 检查有没有遗漏的 max-height + 不同步 max-width */
const bad = /\.vinyl-zone\s*\{[^}]*max-height[^}]*\}/.test(c1.replace(/\/\*[\s\S]*?\*\//g, ''))
console.log('还有 max-height 冲突: ' + (bad ? '✗ 有' : '✓ 无'))
