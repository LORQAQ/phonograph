'use strict'
/* 查 btnOpenSettings / btnOpenSources 的绑定 */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

const s = fs.readFileSync('public/app.js', 'utf8')
const h = fs.readFileSync('public/index.html', 'utf8')

console.log('=== HTML 里的按钮 ===')
;['btnOpenSettings', 'btnOpenSources', 'btnOpenRec', 'btnSearch', 'btnOpenImport'].forEach((id) => {
  const re = new RegExp('id="' + id + '"')
  console.log('  #' + id + ': ' + (re.test(h) ? '✓ 存在' : '✗ 不存在'))
})

console.log('\n=== app.js 里的绑定 ===')
;['btnOpenSettings', 'btnOpenSources'].forEach((id) => {
  const re = new RegExp("\\$\\('#" + id + "'\\)", 'g')
  const hits = s.match(re) || []
  console.log('  #' + id + ': ' + hits.length + ' 处引用')
  /* 找绑定行 */
  const lines = s.split('\n')
  lines.forEach((l, i) => {
    if (l.includes("'#" + id + "'")) console.log('    L' + (i + 1) + ': ' + l.trim().slice(0, 110))
  })
})

console.log('\n=== 绑定方式全景（bindEvents 里）===')
const bi = s.indexOf('function bindEvents')
if (bi > 0) {
  const bs = s.indexOf('{', bi)
  let d = 0, e = bs
  for (let k = bs; k < s.length; k++) {
    if (s[k] === '{') d++
    else if (s[k] === '}') { d--; if (d === 0) { e = k + 1; break } }
  }
  const body = s.slice(bs, e)
  const bindings = body.match(/\$\('[^']+'\)\.onclick\s*=/g) || []
  console.log('  bindEvents 里 onclick 绑定数: ' + bindings.length)
  const ids = bindings.map((b) => (b.match(/'#([^']+)'/) || [])[1]).filter(Boolean)
  console.log('  绑定的 id: ' + ids.join(', '))
}

console.log('\n=== 设置按钮是否有别的处理路径 ===')
const lines = s.split('\n')
lines.forEach((l, i) => {
  if (/openSettings|renderSettingsPane|settingsBody/.test(l) && /onclick|addEventListener|switchView/.test(l)) {
    console.log('  L' + (i + 1) + ': ' + l.trim().slice(0, 110))
  }
})
