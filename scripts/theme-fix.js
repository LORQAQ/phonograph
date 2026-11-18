'use strict'
/* 收尾：把残留的深色硬编码替换成主题变量 */
const fs = require('node:fs')
const p = 'public/style.css'
let s = fs.readFileSync(p, 'utf8')

const reps = [
  ['linear-gradient(180deg,#141210,var(--panel-b))', 'linear-gradient(180deg,var(--panel-a),var(--panel-b))'],
  ['background:var(--text);color:#0e1013', 'background:var(--text);color:var(--bg)'],
  ['.play-btn{width:34px;height:34px;border-radius:50%;background:var(--text);color:#0e1013', '.play-btn{width:34px;height:34px;border-radius:50%;background:var(--text);color:var(--bg)'],
  ['background:#2c2620', 'background:var(--border)'],
  ['.card{background:#151210', '.card{background:var(--panel-a)'],
  ['border:1px solid #21304a', 'border:1px solid var(--border-strong)'],
]

let n = 0
for (const [a, b] of reps) {
  if (s.includes(a)) { s = s.split(a).join(b); n++ }
}
// 进度条 / 音量条轨道
s = s.replace(/height:3px;background:#2c2620/g, 'height:3px;background:var(--border)')
s = s.replace(/height:3px;border-radius:2px;cursor:pointer;background:#2c2620/g, 'height:3px;border-radius:2px;cursor:pointer;background:var(--border)')

fs.writeFileSync(p, s, 'utf8')
console.log('收尾替换:', n, '组')
