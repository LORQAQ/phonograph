'use strict'
/* 检查前端资源完整性 */
const fs = require('node:fs')

const css = fs.readFileSync('public/style.css', 'utf8')
const html = fs.readFileSync('public/index.html', 'utf8')
const js = fs.readFileSync('public/app.js', 'utf8')

const classes = ['.rail-item', '.song-list', '.player-bar', '.lyric-line', '.dl-list', '.vinyl', '.search-box']
console.log('=== CSS 类定义 ===')
for (const c of classes) {
  const re = new RegExp(c.replace('.', '\\.'), 'g')
  const n = (css.match(re) || []).length
  console.log('  ' + c.padEnd(14) + n + ' 处')
}

console.log('\n=== HTML 结构 ===')
const railN = (html.match(/class="rail-item/g) || []).length
console.log('  rail-item 按钮     ' + railN + ' 个')
const svgN = (html.match(/<svg/g) || []).length
console.log('  svg 图标           ' + svgN + ' 个')
const symbolN = (html.match(/<symbol/g) || []).length
console.log('  symbol 定义        ' + symbolN + ' 个')

console.log('\n=== 资源引用 ===')
const cssRef = html.match(/<link[^>]*style\.css[^>]*>/)
const jsRef = html.match(/<script[^>]*app\.js[^>]*>/)
console.log('  CSS:  ' + (cssRef ? cssRef[0] : '缺失'))
console.log('  JS :  ' + (jsRef ? jsRef[0] : '缺失'))

console.log('\n=== 文件大小 ===')
console.log('  style.css   ' + (css.length / 1024).toFixed(1) + ' KB')
console.log('  app.js      ' + (js.length / 1024).toFixed(1) + ' KB')
console.log('  index.html  ' + (html.length / 1024).toFixed(1) + ' KB')

console.log('\n=== SVG 尺寸限制检查 ===')
/* 图标爆炸的典型原因：svg 没有 width/height 且 CSS 没限制 */
const svgLimit = (css.match(/svg\s*\{[^}]*width/g) || []).length
console.log('  CSS 中 svg 宽度限制: ' + (svgLimit ? '有' : '无（可能导致图标超大）'))
const railSvg = (css.match(/\.rail-item\s+svg[^{]*\{[^}]*\}/g) || [])
console.log('  .rail-item svg 规则: ' + (railSvg.length ? railSvg[0].slice(0, 80) : '无'))
