'use strict'
/* 手机端「播放」标签页布局诊断 */
const fs = require('node:fs')
const html = fs.readFileSync('mobile/www/index.html', 'utf8')
const css = fs.readFileSync('mobile/www/style.css', 'utf8')

console.log('=== 播放页 HTML 结构 ===')
/* 找 deck / now-playing 相关 */
for (const key of ['class="deck', 'id="deck', 'now-playing', 'nv-', 'np-cover']) {
  const i = html.indexOf(key)
  if (i > 0) {
    console.log('\n[' + key + '] L' + (html.slice(0, i).split('\n').length))
    console.log(html.slice(Math.max(0, i - 200), i + 700))
    break
  }
}

console.log('\n\n=== deck 相关 CSS ===')
const rules = css.match(/\.[a-z-]*deck[^{]*\{[^}]*\}/g) || []
rules.slice(0, 8).forEach((r) => console.log('  ' + r.replace(/\s+/g, ' ').slice(0, 180)))

console.log('\n=== 移动端 deck 规则 ===')
const mobileRules = css.match(/@media \(max-width: 860px\)[^{]*\{[\s\S]*?\n\}/g) || []
mobileRules.forEach((blk) => {
  if (/deck|np-|now-playing/.test(blk)) {
    blk.split('\n').forEach((l) => {
      if (/deck|np-|now-playing/.test(l)) console.log('  ' + l.trim().slice(0, 150))
    })
  }
})

console.log('\n=== m-deck 类（移动端播放页）===')
const mdeck = css.match(/\.m-deck[^{]*\{[^}]*\}/g) || []
mdeck.forEach((r) => console.log('  ' + r.replace(/\s+/g, ' ').slice(0, 180)))

console.log('\n=== HTML 里 m-deck 出现处 ===')
const j = html.indexOf('m-deck')
if (j > 0) console.log(html.slice(Math.max(0, j - 250), j + 250))
