'use strict'
/* 诊断手机端音源：文件完整性 + 音源列表 + 多首取流测试 */
const fs = require('node:fs')
const path = require('node:path')

const WWW = 'mobile/www'

console.log('=== 1. 关键文件 ===')
for (const f of ['app.js', 'api-mobile.js', 'sources-data.js', 'style.css', 'index.html',
  'lib/lx-engine-web.js', 'lib/native-http.js', 'lib/music-libs.js',
  'lib/vendor/crypto-js.min.js', 'lib/vendor/pako.min.js', 'lib/vendor/jsencrypt.min.js']) {
  const p = path.join(WWW, f)
  if (fs.existsSync(p)) {
    console.log('  OK   ' + f.padEnd(34) + (fs.statSync(p).size / 1024).toFixed(0) + ' KB')
  } else {
    console.log('  缺失 ' + f)
  }
}

console.log('\n=== 2. sources-data.js 里的音源 ===')
const sd = fs.readFileSync(path.join(WWW, 'sources-data.js'), 'utf8')
console.log('  大小: ' + (sd.length / 1024).toFixed(0) + ' KB')
/* 常见格式:  {name:"xxx", ...} 或 "xxx":{...} */
const byName = [...sd.matchAll(/name:\s*['"]([^'"]+)['"]/g)].map((m) => m[1])
console.log('  音源名: ' + (byName.length ? byName.join(', ') : '（未匹配到 name 字段）'))
const byKey = [...sd.matchAll(/sysId|source:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]).filter(Boolean)
console.log('  source 标识: ' + ([...new Set(byKey)].slice(0, 12).join(', ') || '无'))

console.log('\n=== 3. 引擎优先级配置 ===')
const eng = fs.readFileSync(path.join(WWW, 'lib/lx-engine-web.js'), 'utf8')
const prio = eng.match(/PRIO(_KG)?\s*=\s*\[[^\]]*\]/g) || []
prio.forEach((p) => console.log('  ' + p.replace(/\s+/g, ' ').slice(0, 200)))

console.log('\n=== 4. api-mobile.js 的取流路径 ===')
const api = fs.readFileSync(path.join(WWW, 'api-mobile.js'), 'utf8')
const lines = api.split('\n')
lines.forEach((l, i) => {
  if (/function.*(url|stream|resolve)|resolveWith|fallback|cross/i.test(l)) {
    console.log('  L' + (i + 1) + ': ' + l.trim().slice(0, 110))
  }
})

console.log('\n=== 5. index.html 脚本加载顺序 ===')
const html = fs.readFileSync(path.join(WWW, 'index.html'), 'utf8')
const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1])
scripts.forEach((s, i) => console.log('  ' + (i + 1) + '. ' + s))
