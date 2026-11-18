'use strict'
/* 把能用的音源导入项目：跳过 OOM 的、按内容去重、重命名为安全文件名 */
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const OUT = 'sources'
const DIRS = [
  'D:\\edge\\js',
  'D:\\edge\\js\\本地音源-11月更新（v7）',
  'D:\\edge\\js\\本地音源-9月更新（v6）',
]

/* 已知会导致 OOM / 超时的，直接排除 */
const BLACKLIST = [
  'lx-music-source V3.0.js',
  '【推荐】长青SVIP音源v1.2.0（全平台支持无损）.js',
]

/* 文件名 → 安全 id */
function safeId (name) {
  const map = [
    ['fish', 'fish2'], ['freelisten', 'freelisten'], ['ikun', 'ikun2'],
    ['独家音源] v4', 'dujia4'], ['其他源', 'qita'],
    ['云端', 'yunduan'], ['小熊猫', 'xxm'], ['念心', 'nianxin2'],
    ['星空', 'xingkong'], ['聚合API', 'juheapi'],
    ['野花', 'yehua'], ['野草', 'yecao'],
    ['音乐下载器', 'dl6'], ['HYW', 'hyw'],
    ['K×H', 'kxh'], ['屿溪', 'yuxi'],
    ['独家音源V7', 'dujia7'], ['长青', 'changqing2'],
    ['玉宁熙', 'yuningxi'], ['独家v6', 'dujia6'],
  ]
  const lower = name.toLowerCase()
  for (const [k, v] of map) {
    if (lower.includes(k.toLowerCase())) return v
  }
  return null
}

const seen = new Set()
const imported = []
let skipped = 0

/* 先保留项目里已有的（15 个），它们的 id 稳定 */
for (const f of fs.readdirSync(OUT)) {
  if (f.endsWith('.js')) {
    const buf = fs.readFileSync(path.join(OUT, f))
    seen.add(crypto.createHash('md5').update(buf).digest('hex'))
  }
}

for (const d of DIRS) {
  if (!fs.existsSync(d)) continue
  for (const f of fs.readdirSync(d)) {
    if (!f.toLowerCase().endsWith('.js')) continue
    if (BLACKLIST.some((b) => f.includes(b))) { skipped++; continue }
    const full = path.join(d, f)
    const buf = fs.readFileSync(full)
    const hash = crypto.createHash('md5').update(buf).digest('hex')
    if (seen.has(hash)) { skipped++; continue }   // 内容重复
    const id = safeId(f)
    if (!id) { skipped++; continue }
    if (fs.existsSync(path.join(OUT, id + '.js'))) { skipped++; continue }
    fs.writeFileSync(path.join(OUT, id + '.js'), buf)
    seen.add(hash)
    imported.push(id + '  ← ' + f)
  }
}

console.log('新增导入 ' + imported.length + ' 个，跳过 ' + skipped + ' 个（重复/黑名单）')
imported.forEach((x) => console.log('  ' + x))
console.log('\n当前共 ' + fs.readdirSync(OUT).filter((f) => f.endsWith('.js')).length + ' 个脚本：')
console.log('  ' + fs.readdirSync(OUT).filter((f) => f.endsWith('.js')).join(', '))
