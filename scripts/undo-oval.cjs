'use strict'
/* 撤销导致唱片变椭圆的规则（两个文件都查） */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

const BAD = `.vinyl-zone > *{
  width:100%;
  height:100%;
  aspect-ratio:1/1;
}`

const REPLACE = `/* 已撤销：.vinyl-zone > * { width:100%; height:100%; aspect-ratio:1/1 }
   父容器 width:100% + max-height 生效时是矩形，子元素跟着拉成椭圆。
   保持唱片为正圆只能靠 .vinyl-zone 自身的 aspect-ratio。 */`

for (const f of ['public/style.css', 'mobile/www/style.css']) {
  if (!fs.existsSync(f)) continue
  let c = fs.readFileSync(f, 'utf8')
  if (c.includes(BAD)) {
    c = c.replace(BAD, REPLACE)
    fs.writeFileSync(f, c, 'utf8')
    console.log(f + ': ✓ 已撤销')
  } else {
    /* 宽松匹配：可能有缩进差异 */
    const re = /\.vinyl-zone\s*>\s*\*\s*\{[^}]*aspect-ratio[^}]*\}/
    if (re.test(c)) {
      c = c.replace(re, REPLACE)
      fs.writeFileSync(f, c, 'utf8')
      console.log(f + ': ✓ 已撤销（宽松匹配）')
    } else {
      console.log(f + ': 没有该规则')
    }
  }
}

/* 确认 */
console.log('\n=== 确认 ===')
for (const f of ['public/style.css', 'mobile/www/style.css']) {
  const c = fs.readFileSync(f, 'utf8')
  const still = /\.vinyl-zone\s*>\s*\*\s*\{[^}]*aspect-ratio/.test(c)
  const good = /\.vinyl-zone\{[^}]*aspect-ratio:1\/1/.test(c) || /\.vinyl-zone\s*\{[^}]*aspect-ratio/.test(c)
  console.log('  ' + f)
  console.log('    可疑子元素规则: ' + (still ? '✗ 还在' : '✓ 没了'))
  console.log('    .vinyl-zone 自身 aspect-ratio: ' + (good ? '✓ 保留' : '? 检查'))
}

/* 打印 .vinyl-zone 的所有规则，人工确认 */
const c1 = fs.readFileSync('public/style.css', 'utf8')
console.log('\n=== 所有 .vinyl-zone 规则 ===')
const re2 = /\.vinyl-zone[^{]*\{[^}]*\}/g
let m
let i = 0
while ((m = re2.exec(c1))) {
  i++
  console.log('  ' + i + '. ' + m[0].replace(/\s+/g, ' ').slice(0, 160))
}
