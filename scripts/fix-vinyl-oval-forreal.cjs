'use strict'
/**
 * 彻底修唱片椭圆问题
 *
 * 根因：.vinyl-zone 同时被设了
 *   max-width:250px   （规则 2）
 *   max-height:280px  （规则 14 等）
 * 两者不同步 → 容器是 250 x 280 的矩形 → 里面的唱片被拉成椭圆并溢出。
 *
 * 正解：只用一个尺寸源。用 vh 反推出宽度上限，宽高都由同一个值决定：
 *   width: 100%;
 *   max-width: min(100%, 32vh);   ← 宽度上限跟着视口高度走
 *   aspect-ratio: 1/1;            ← 高度 = 宽度，永远是正方形
 * 这样既不会超出竖向空间，也保证正圆。
 */

const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

const MARK = '/* ==== 唱片尺寸：单一来源，保证正圆 ==== */'
const patch = `
${MARK}

/* 先清掉历史遗留的 max-width:250px —— 它和任何 max-height 一起出现都会产生矩形 */
.vinyl-zone{
  position:relative;
  margin:0 auto;
  width:100%;
  /* 关键：宽度上限跟着视口高度走，宽高永远同步 */
  max-width:min(100%, 34vh);
  aspect-ratio:1/1;
  height:auto;
  max-height:none;
}
/* 宽屏时用高度限制反推宽度（竖屏/窄屏走上面的 vh 就够了） */
@media (min-width:861px){
  .vinyl-zone{
    max-width:min(100%, 34vh, 340px);
  }
}
@media (max-height:720px){
  .vinyl-zone{max-width:min(100%, 26vh)}
}
@media (max-height:640px){
  .vinyl-zone{max-width:min(100%, 22vh)}
}
@media (max-width:1180px){
  .vinyl-zone{max-width:min(100%, 30vh)}
}
@media (max-width:980px){
  .vinyl-zone{max-width:min(100%, 28vh)}
}
@media (max-width:860px){
  .vinyl-zone{max-width:min(100%, 26vh)}
}

/* 里面的唱片/纹路/标签撑满这个正方形，不要再各自写 aspect-ratio */
.vinyl-zone .vinyl,
.vinyl-zone .plinth,
.vinyl-zone .tonearm{
  max-width:100%;
  max-height:100%;
}
`

for (const f of ['public/style.css', 'mobile/www/style.css']) {
  if (!fs.existsSync(f)) continue
  let c = fs.readFileSync(f, 'utf8')

  /* 1) 删掉那条致命的 max-width:250px */
  const before1 = c
  c = c.replace(/\.vinyl-zone\{max-width:250px\}/g, '/* .vinyl-zone{max-width:250px} 已删除：和 max-height 冲突导致椭圆 */')

  /* 2) 删掉之前几轮加的散装 max-height（它们和新的 max-width 方案重复） */
  const stripPatterns = [
    /\.vinyl-zone\s*\{\s*max-height:\s*min\(4[26]vh,\s*(?:100%|420px)\)\s*;?\s*\}/g,
    /\.vinyl-zone\s*\{\s*max-height:\s*min\(3[468]vh,\s*(?:3[024]0|2[46]0)px\)\s*;?\s*\}/g,
    /\.vinyl-zone\s*\{\s*max-height:\s*min\(2[268]vh,\s*(?:2[24]0|190)px\)\s*;?\s*\}/g,
    /\.vinyl-zone\s*\{\s*max-height:\s*min\(40vh,\s*360px\)\s*;?\s*\}/g,
  ]
  let removed = 0
  for (const re of stripPatterns) {
    const m = c.match(re)
    if (m) { removed += m.length; c = c.replace(re, '/* 旧 max-height 规则已移除 */') }
  }

  /* 3) 追加新方案 */
  if (!c.includes(MARK)) c = c + patch

  fs.writeFileSync(f, c, 'utf8')
  console.log(f + ': 删了 250px 限制' + (before1 !== c ? ' ✓' : ' (无)') + '，移除 ' + removed + ' 条旧 max-height，已追加新方案')
}

/* 确认 */
console.log('\n=== 最终所有 .vinyl-zone 规则（含注释里的） ===')
const c1 = fs.readFileSync('public/style.css', 'utf8')
const re = /\.vinyl-zone[^{]*\{[^}]*\}/g
let m
let n = 0
while ((m = re.exec(c1))) {
  n++
  const t = m[0].replace(/\s+/g, ' ')
  /* 跳过被注释掉的 */
  const start = m.index
  const before = c1.lastIndexOf('/*', start)
  const closeBefore = c1.lastIndexOf('*/', start)
  const inComment = before > closeBefore
  console.log('  ' + n + '.' + (inComment ? ' [注释]' : ' [生效]') + ' ' + t.slice(0, 120))
}
