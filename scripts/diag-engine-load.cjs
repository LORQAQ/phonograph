'use strict'
/* 引擎到底怎么加载音源代码 */
const fs = require('node:fs')

const eng = fs.readFileSync('mobile/www/lib/lx-engine-web.js', 'utf8')
const api = fs.readFileSync('mobile/www/api-mobile.js', 'utf8')
const app = fs.readFileSync('mobile/www/app.js', 'utf8')

console.log('=== 谁引用了 LX_SOURCES ===')
for (const [name, src] of [['lx-engine-web.js', eng], ['api-mobile.js', api], ['app.js', app]]) {
  const n = (src.match(/LX_SOURCES/g) || []).length
  console.log('  ' + name.padEnd(22) + n + ' 处')
  if (n) {
    src.split('\n').forEach((l, i) => {
      if (l.includes('LX_SOURCES')) console.log('    L' + (i + 1) + ': ' + l.trim().slice(0, 130))
    })
  }
}

console.log('\n=== 引擎的公开 API ===')
const globalVars = eng.match(/(?:window|globalThis)\.(\w+)\s*=/g) || []
console.log('  赋值到全局: ' + [...new Set(globalVars.map((x) => x.replace(/[=\s]/g, '')))].join(', '))

console.log('\n=== 引擎里 preload / init 相关 ===')
eng.split('\n').forEach((l, i) => {
  if (/function\s+(preload|init|load|register)|preloadScripts|async init/i.test(l)) {
    console.log('  L' + (i + 1) + ': ' + l.trim().slice(0, 120))
  }
})

console.log('\n=== api-mobile.js 里 preload / init 调用 ===')
api.split('\n').forEach((l, i) => {
  if (/preload|init|LX_SOURCES|LxScriptManager/i.test(l)) {
    console.log('  L' + (i + 1) + ': ' + l.trim().slice(0, 130))
  }
})

console.log('\n=== app.js 启动时调用什么 ===')
const bootIdx = app.indexOf('async function boot')
if (bootIdx > 0) {
  console.log(app.slice(bootIdx, bootIdx + 900))
}
