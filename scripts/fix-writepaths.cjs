'use strict'
/* 修正：只在 WRITE_PATHS 块内判断是否已存在 */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

const sp = 'app/server.js'
let sv = fs.readFileSync(sp, 'utf8')

/* 取出 WRITE_PATHS 块 */
const startIdx = sv.indexOf('WRITE_PATHS = new Set([')
if (startIdx < 0) { console.log('找不到 WRITE_PATHS'); process.exit(1) }
const endIdx = sv.indexOf('])', startIdx)
if (endIdx < 0) { console.log('找不到 WRITE_PATHS 结尾'); process.exit(1) }

let block = sv.slice(startIdx, endIdx + 2)
console.log('=== 修改前 ===')
console.log(block)

const need = ['/api/downloads/reveal', '/api/sources/test']
let changed = false
for (const w of need) {
  if (block.includes("'" + w + "'")) {
    console.log('  - ' + w + ' 已在块内')
    continue
  }
  /* 在块内最后一个条目后追加 */
  const lastQuote = block.lastIndexOf("',")
  if (lastQuote < 0) { console.log('  ! 块格式异常'); continue }
  block = block.slice(0, lastQuote + 2) + `\n        '${w}',` + block.slice(lastQuote + 2)
  console.log('  + ' + w + ' 已加入')
  changed = true
}

if (changed) {
  sv = sv.slice(0, startIdx) + block + sv.slice(endIdx + 2)
  fs.writeFileSync(sp, sv, 'utf8')
}

console.log('\n=== 修改后 ===')
const cur = fs.readFileSync(sp, 'utf8')
const s2 = cur.indexOf('WRITE_PATHS = new Set([')
console.log(cur.slice(s2, cur.indexOf('])', s2) + 2))
