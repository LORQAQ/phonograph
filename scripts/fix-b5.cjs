'use strict'
/* B5 用行级操作修复（前面缩进不确定） */
const fs = require('node:fs')

const sp = 'app/server.js'
const lines = fs.readFileSync(sp, 'utf8').split('\n')

/* 找含 process.exit(0) 且前面有 setTimeout 的行 */
let target = -1
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('process.exit(0)') && lines[i].includes('setTimeout')) {
    target = i
    break
  }
}

if (target < 0) {
  console.log('未找到退出行')
  process.exit(1)
}

console.log('目标行 L' + (target + 1) + ': ' + lines[target].trim())

if (lines[target].includes('writeDbNow')) {
  console.log('已修复过')
  process.exit(0)
}

/* 取缩进 */
const indent = (lines[target].match(/^(\s*)/) || ['', '      '])[1]

/* 在这一行之前插入保存逻辑 */
const insert = [
  indent + '/* B5: 退出前同步写盘，避免最后一次修改丢失 */',
  indent + 'try {',
  indent + '  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }',
  indent + '  writeDbNow()',
  indent + '  console.log(\'数据已保存\')',
  indent + '} catch (e) { console.error(\'[db] 退出前保存失败\', e.message) }',
]

lines.splice(target, 0, ...insert)

/* 把 150 改成 300 */
lines[target + insert.length] = lines[target + insert.length].replace('150', '300')

fs.writeFileSync(sp, lines.join('\n'), 'utf8')
console.log('B5 已插入')

/* 验证 */
const s = fs.readFileSync(sp, 'utf8')
console.log('\n=== B5 验证 ===')
console.log('  含 writeDbNow:', s.includes('writeDbNow()'))
console.log('  含 数据已保存:', s.includes('数据已保存'))
