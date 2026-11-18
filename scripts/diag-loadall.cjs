'use strict'
/* 手机端音源加载：看 loadAll 是否一次加载 50+ 个（内存/超时风险） */
const fs = require('node:fs')

const eng = fs.readFileSync('mobile/www/lib/lx-engine-web.js', 'utf8')
const api = fs.readFileSync('mobile/www/api-mobile.js', 'utf8')

console.log('=== loadAll 实现 ===')
const i = eng.indexOf('loadAll')
if (i > 0) {
  console.log(eng.slice(Math.max(0, i - 300), i + 1200))
} else {
  console.log('  引擎里没有 loadAll，可能在 api-mobile.js')
}

console.log('\n=== api-mobile.js 的 preloadScripts ===')
const j = api.indexOf('window.preloadScripts')
if (j > 0) console.log(api.slice(j, j + 700))

console.log('\n=== resolve 里 PRIO 怎么用 ===')
const prio = eng.match(/PRIO[^=]*=\s*\[[^\]]*\]/g) || []
console.log(prio.join('\n'))

const ri = eng.indexOf('PRIO')
if (ri > 0) {
  /* 找 resolve 函数 */
  const rj = eng.indexOf('async resolve')
  if (rj > 0) console.log('\n=== async resolve ===\n' + eng.slice(rj, rj + 1600))
}
