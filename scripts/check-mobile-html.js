'use strict'
/* 检查手机端 index.html 是否加载了全部必需脚本 */
const fs = require('node:fs')

const h = fs.readFileSync('mobile/www/index.html', 'utf8')

const scripts = [...h.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1])
console.log('=== 脚本引用 ' + scripts.length + ' 个 ===')
scripts.forEach((s) => console.log('  ' + s))

const css = [...h.matchAll(/<link[^>]*stylesheet[^>]*href="([^"]+)"/g)].map((m) => m[1])
console.log('\n=== CSS ===')
css.forEach((s) => console.log('  ' + s))

console.log('\n=== 必需项检查 ===')
const need = ['style.css', 'app.js', 'api-mobile.js', 'sources-data.js', 'lib/lx-engine-web.js', 'lib/native-http.js', 'lib/music-libs.js']
for (const n of need) {
  const ok = scripts.includes(n) || css.includes(n) || scripts.some((s) => s.startsWith(n))
  console.log('  ' + (ok ? '✓' : '✗') + ' ' + n)
}

console.log('\n=== 绝对路径残留 ===')
const abs = [...h.matchAll(/(?:href|src)="\/[^"]*"/g)].map((m) => m[0])
console.log(abs.length ? abs.join('\n') : '  无')
