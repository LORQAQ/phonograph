'use strict'
/* 给缺失元素的绑定加存在性判断，避免 boot 中断 */
const fs = require('node:fs')
const p = 'public/app.js'
let s = fs.readFileSync(p, 'utf8')

/* 形如  $('#xxx').onclick = ...  且 #xxx 已从页面删除 → 加 if 判断 */
const MISSING = ['btnLrcBigger', 'btnLrcSmaller', 'btnLrcPlus', 'btnLrcMinus', 'volNum', 'srcBadge', 'srcStatus']

let fixed = 0
for (const id of MISSING) {
  const re = new RegExp("(\\s*)\\$\\('#" + id + "'\\)\\.", 'g')
  s = s.replace(re, (m, ws) => {
    fixed++
    return ws + "if ($('#" + id + "')) $('#" + id + "')."
  })
}

/* 带多行语句的单独处理：$('#volNum').textContent = ... 之类已经覆盖；
   还有直接读 textContent/value 的，保持原样（有判断后不会执行） */

fs.writeFileSync(p, s, 'utf8')
console.log('已加判断:', fixed, '处')

/* 再扫一遍 */
const html = fs.readFileSync('public/index.html', 'utf8')
const htmlIds = new Set()
for (const m of html.matchAll(/id="([^"]+)"/g)) htmlIds.add(m[1])
const dynamicIds = new Set()
for (const m of s.matchAll(/id="([^"]+)"/g)) dynamicIds.add(m[1])

const stillBad = []
for (const m of s.matchAll(/\$\('#([A-Za-z0-9_-]+)'\)\.(onclick|onchange|addEventListener)/g)) {
  const id = m[1]
  if (!htmlIds.has(id) && !dynamicIds.has(id)) {
    const line = s.slice(0, m.index).split('\n').length
    stillBad.push(id + ' (L' + line + ')')
  }
}
console.log('仍可能报错:', stillBad.length ? stillBad.join(', ') : '无')
