'use strict'
/* 酷狗真实封面：trans_param.union_cover */
const fs = require('node:fs')
const p = 'mobile/www/api-mobile.js'
let s = fs.readFileSync(p, 'utf8')

/* 找到 cover 那行，整行替换 */
const lines = s.split('\n')
let done = false
for (let i = 0; i < lines.length; i++) {
  const l = lines[i]
  if (!l.includes('cover:') || !l.includes('imge.kugou')) continue
  const indent = (l.match(/^(\s*)/) || ['', '            '])[1]
  lines[i] = indent + "cover: (function (t) { var u = (t && (t.union_cover || t.union_cover_od)) || ''; if (u) return String(u).replace('{size}', '300'); return hash ? ('https://imge.kugou.com/stdmusic/240/' + hash.substring(0, 2) + '/' + hash + '.jpg') : '' })(t.trans_param),"
  done = true
  console.log('替换第 ' + (i + 1) + ' 行')
  break
}

if (!done) {
  console.log('未找到 cover 行，当前 kg 分支内容：')
  const i = s.indexOf("platform === 'kg'")
  console.log(s.slice(i, i + 1200))
  process.exit(1)
}

fs.writeFileSync(p, lines.join('\n'), 'utf8')
console.log('完成')
