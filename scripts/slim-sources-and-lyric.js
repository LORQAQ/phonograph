'use strict'
/* 精简音源：只保留实测最好用的几个 + 删掉歌词页底部工具条 */
const fs = require('node:fs')
const path = require('node:path')

/* ---------- 1) 音源精简 ---------- */
const KEEP = ['fish', 'freelisten', 'dujia6', 'kxh', 'xingkong', 'changqing2', 'yuxi']
const dir = 'sources'
let removed = 0
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith('.js')) continue
  const id = f.replace(/\.js$/, '')
  if (!KEEP.includes(id)) {
    fs.unlinkSync(path.join(dir, f))
    removed++
  }
}
console.log('删除 ' + removed + ' 个，保留: ' + fs.readdirSync(dir).filter((f) => f.endsWith('.js')).join(', '))

/* ---------- 2) 优先级顺序简化 ---------- */
const sp = 'app/lib/source-manager.js'
let s = fs.readFileSync(sp, 'utf8')
s = s.replace(/const KG_ORDER = \[[^\]]*\]/, "const KG_ORDER = ['dujia6', 'kxh', 'xingkong', 'yuxi', 'changqing2', 'fish', 'freelisten']")
fs.writeFileSync(sp, s, 'utf8')
console.log('KG_ORDER 已简化:', s.includes("'dujia6', 'kxh'"))

const mp = 'mobile/www/lib/lx-engine-web.js'
let m = fs.readFileSync(mp, 'utf8')
m = m.replace(/const PRIO = \[[^\]]*\]/, "const PRIO = ['dujia6', 'kxh', 'xingkong', 'yuxi', 'changqing2', 'fish', 'freelisten']")
if (m.includes('const PRIO_KG = [')) {
  m = m.replace(/const PRIO_KG = \[[^\]]*\]/, "const PRIO_KG = ['dujia6', 'kxh', 'xingkong', 'yuxi', 'changqing2', 'fish', 'freelisten']")
}
fs.writeFileSync(mp, m, 'utf8')
console.log('手机端 PRIO 已简化')

/* ---------- 3) 删歌词页底部工具条（A- / A+ / ±0.5s / 偏移） ---------- */
const ip = 'public/index.html'
let h = fs.readFileSync(ip, 'utf8')
const start = h.indexOf('<div class="lyric-tools">')
if (start > 0) {
  const end = h.indexOf('</div>', h.indexOf('偏移', start))
  if (end > 0) {
    h = h.slice(0, start) + h.slice(end + 6)
    fs.writeFileSync(ip, h, 'utf8')
    console.log('歌词工具条已删除')
  }
} else {
  console.log('未找到工具条')
}
