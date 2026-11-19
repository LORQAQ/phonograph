'use strict'
/* 精确删除导致椭圆的那条规则 + 清理重复的 .vinyl-zone 声明 */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

/* 先看看这条规则的确切文本 */
for (const f of ['public/style.css', 'mobile/www/style.css']) {
  const c = fs.readFileSync(f, 'utf8')
  const i = c.indexOf('.vinyl-zone > *')
  if (i < 0) { console.log(f + ': 没有 .vinyl-zone > *'); continue }
  console.log('=== ' + f + ' 中该规则的确切内容 ===')
  console.log(JSON.stringify(c.slice(i, i + 120)))
}
