'use strict'
/* 把 CSS 里硬编码的深色值替换成主题变量，为亮色主题做准备 */
const fs = require('node:fs')
const p = 'public/style.css'
let s = fs.readFileSync(p, 'utf8')

// 变量插入（在 :root 末尾、--ui 之后）
const vars = `
  --bg:#0c0a09;
  --panel-a:#171310;
  --panel-b:#100d0b;
  --bg-hover:#1a1613;
  --bg-elev:#221d19;
  --bg-input:#0c0a09;
  --border:#332c25;
  --border-strong:#443a31;
  --shadow:rgba(0,0,0,.5);
`
if (!s.includes('--panel-a:')) {
  s = s.replace(/(--ui:[^;]+;)/, '$1' + vars)
}

const map = [
  ['#0c0a09', 'var(--bg-input)'],
  ['#171310', 'var(--panel-a)'],
  ['#151110', 'var(--panel-a)'],
  ['#15110e', 'var(--panel-a)'],
  ['#12100e', 'var(--panel-a)'],
  ['#16120f', 'var(--panel-a)'],
  ['#100d0b', 'var(--panel-b)'],
  ['#0b0908', 'var(--panel-b)'],
  ['#0d0b09', 'var(--panel-b)'],
  ['#080706', 'var(--panel-b)'],
  ['#1a1613', 'var(--bg-hover)'],
  ['#1c1814', 'var(--bg-hover)'],
  ['#221d19', 'var(--bg-elev)'],
  ['#241f1a', 'var(--bg-elev)'],
  ['#241f1b', 'var(--bg-elev)'],
  ['#2e2720', 'var(--bg-hover)'],
  ['#2c251e', 'var(--bg-hover)'],
  ['#191512', 'var(--panel-a)'],
  ['#332c25', 'var(--border)'],
  ['#443a31', 'var(--border-strong)'],
  ['#4d4237', 'var(--border-strong)'],
  ['#efe7da', 'var(--text)'],
  ['#a99d8c', 'var(--text-2)'],
  ['#6f6458', 'var(--text-3)'],
]

// 只替换值位置，不动 var(--x) 里的名字
let n = 0
for (const [from, to] of map) {
  const re = new RegExp(from.replace('#', '#'), 'gi')
  s = s.replace(re, (m) => { n++; return to })
}

// 阴影统一
s = s.replace(/rgba\(0,0,0,\.(5|55|6|65|7)\)/g, (m) => { n++; return 'var(--shadow)' })
s = s.replace(/rgba\(0,0,0,\.(3|35|4|42|45)\)/g, (m) => { n++; return 'rgba(0,0,0,.28)' })

fs.writeFileSync(p, s, 'utf8')
console.log('替换', n, '处颜色')
