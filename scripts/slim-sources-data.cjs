'use strict'
/* sources-data.js 只保留 7 个在用音源，其余删掉 */
const fs = require('node:fs')

const KEEP = ['dujia6', 'kxh', 'xingkong', 'yuxi', 'changqing2', 'fish', 'freelisten']
const file = 'mobile/www/sources-data.js'
const src = fs.readFileSync(file, 'utf8')

console.log('原文件: ' + (src.length / 1024).toFixed(0) + ' KB')

/* 结构：window.LX_SOURCES=[{...},{...}]  */
const start = src.indexOf('[')
const end = src.lastIndexOf(']')
if (start < 0 || end < 0) { console.log('未找到数组'); process.exit(1) }

const arrText = src.slice(start, end + 1)

/* 用 vm 安全解析（只求值 JSON-ish 字面量） */
const vm = require('node:vm')
let list = null
try {
  list = vm.runInNewContext(arrText, {}, { timeout: 10000 })
} catch (e) {
  console.log('解析失败: ' + e.message)
  /* 退回正则法：按 {"id":"xxx","code":"..."} 切片 */
  const items = []
  const re = /\{"id":"([^"]+)","code":"([\s\S]*?)"\}/g
  let m
  while ((m = re.exec(arrText)) !== null) {
    items.push({ id: m[1], code: m[2] })
  }
  list = items
  console.log('正则解析出 ' + items.length + ' 个')
}

console.log('原始音源数: ' + list.length)
const ids = list.map((x) => x.id)
console.log('原始 id: ' + ids.join(', '))

const kept = list.filter((x) => KEEP.includes(x.id))
console.log('\n保留: ' + kept.length + ' 个 -> ' + kept.map((x) => x.id).join(', '))
const dropped = list.filter((x) => !KEEP.includes(x.id))
console.log('删除: ' + dropped.length + ' 个')
console.log('  删掉的 id: ' + dropped.map((x) => x.id).join(', ').slice(0, 300))

if (!kept.length) { console.log('\n一个都没保留，放弃写入'); process.exit(1) }

/* 缺失的提醒 */
for (const k of KEEP) {
  if (!kept.some((x) => x.id === k)) console.log('  ⚠ 缺失音源: ' + k)
}

const out = 'window.LX_SOURCES=' + JSON.stringify(kept) + ';\n'
const bak = file + '.full.bak'
if (!fs.existsSync(bak)) fs.writeFileSync(bak, src, 'utf8')
fs.writeFileSync(file, out, 'utf8')

console.log('\n新文件: ' + (out.length / 1024).toFixed(0) + ' KB（原 ' + (src.length / 1024).toFixed(0) + ' KB）')
console.log('完整备份: ' + bak)
