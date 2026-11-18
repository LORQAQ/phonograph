'use strict'
/* 修：SCRIPT_PRIORITY 作用域问题 → 改为内联排序（fish 优先） */
const fs = require('node:fs')
const p = 'mobile/www/lib/lx-engine-web.js'
let s = fs.readFileSync(p, 'utf8')

const old = `      const ordered = Array.from(this.scripts.entries()).sort((a, b) => {
        const ia = SCRIPT_PRIORITY.indexOf(a[0])
        const ib = SCRIPT_PRIORITY.indexOf(b[0])
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
      })
      for (const [id, s] of ordered) {`

const neu = `      /* fish 最快最稳，排最前；其余保持加载顺序 */
      const PRIO = ['fish', 'nianxin', 'kulao', 'quandouyao', 'yiyin', 'lxv7', 'lx', 'huibq', 'ikun', 'flower', 'grass', 'changqing', 'juhe', 'sixyin']
      const ordered = Array.from(this.scripts.entries()).sort((a, b) => {
        const ia = PRIO.indexOf(a[0]); const ib = PRIO.indexOf(b[0])
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
      })
      for (const [id, s] of ordered) {`

if (s.includes(old)) {
  s = s.replace(old, neu)
  fs.writeFileSync(p, s, 'utf8')
  console.log('已改为内联 PRIO')
} else if (s.includes('const PRIO =')) {
  console.log('已是内联版')
} else {
  console.log('未匹配，检查现状')
  const i = s.indexOf('for (const [id, s] of')
  console.log(s.slice(Math.max(0, i - 260), i + 60))
}

/* 移除模块级 SCRIPT_PRIORITY 定义（避免混淆） */
s = fs.readFileSync(p, 'utf8')
s = s.replace(/\/\* 已知成功率高的脚本优先[^\n]*\nconst SCRIPT_PRIORITY = \[[^\]]*\]\n\n/, '')
fs.writeFileSync(p, s, 'utf8')
console.log('SCRIPT_PRIORITY 残留:', s.includes('SCRIPT_PRIORITY'))
