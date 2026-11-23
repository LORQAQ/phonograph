'use strict'
/* 手机端：mi 补上 name / singer / album / interval（原来写死空串和 00:00） */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

const p = 'mobile/www/api-mobile.js'
let s = fs.readFileSync(p, 'utf8')

const old = [
  '        const mi = {',
  '          songmid: id,',
  '          songId: id,',
  '          hash: id,',
  "          name: '',",
  "          singer: '',",
  "          albumName: '',",
  "          interval: '00:00',",
  '          _types: {},',
  '        }',
].join('\n')

const neu = [
  '        const mi = {',
  '          songmid: id,',
  '          songId: id,',
  '          hash: id,',
  "          name: q.get('name') || '',",
  "          singer: q.get('singer') || '',",
  "          albumName: q.get('album') || '',",
  '          /* 之前写死 \'00:00\'，脚本拿不到真实时长，片段校验也失效 */',
  "          interval: q.get('interval') || '',",
  '          _types: {},',
  '        }',
].join('\n')

if (s.includes(old)) {
  s = s.replace(old, () => neu)
  fs.writeFileSync(p, s, 'utf8')
  console.log('✓ mi 字段已补全')
} else {
  /* 兼容行尾差异，用逐行定位 */
  const lines = s.split('\n')
  const i = lines.findIndex((l) => l.trim() === 'interval:' + " '00:00',")
  if (i > 0) {
    lines[i] = "          interval: q.get('interval') || '',"
    for (let k = i - 1; k >= Math.max(0, i - 5); k--) {
      if (lines[k].includes("name: ''")) lines[k] = "          name: q.get('name') || '',"
      if (lines[k].includes("singer: ''")) lines[k] = "          singer: q.get('singer') || '',"
      if (lines[k].includes("albumName: ''")) lines[k] = "          albumName: q.get('album') || '',"
    }
    fs.writeFileSync(p, lines.join('\n'), 'utf8')
    console.log('✓ mi 字段已补全（逐行方式）')
  } else {
    console.log('⚠ 未找到 interval 行')
  }
}