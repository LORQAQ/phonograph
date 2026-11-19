'use strict'
/* 修 audit5-css 报告的 P1/P2 */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

const results = []
function step (name, fn) {
  try { const r = fn(); results.push({ name, ok: true }); console.log('  ✓ ' + name + (r ? '  ' + r : '')) }
  catch (e) { results.push({ name, ok: false, msg: e.message }); console.log('  ✗ ' + name + '  ' + e.message) }
}

for (const f of ['public/style.css', 'mobile/www/style.css']) {
  if (!fs.existsSync(f)) continue
  let c = fs.readFileSync(f, 'utf8')
  const orig = c

  /* ========== 问题 5：转速被 8s 覆盖，改回只加 contain ========== */
  step('[' + f + '] 5. 转速 8s → 交还给 1.8s', () => {
    const bad = `.vinyl.playing{
  animation:spin 8s linear infinite;
  contain:layout style;
}`
    if (c.includes(bad)) {
      c = c.replace(bad, `/* 只加 contain，动画时长交还给上面 .vinyl.playing{animation:spin 1.8s} */
.vinyl.playing{
  contain:layout style;
}`)
      return '已改'
    }
    /* 宽松匹配 */
    const re = /\.vinyl\.playing\s*\{[^}]*animation:\s*spin\s+8s[^}]*\}/
    if (re.test(c)) {
      c = c.replace(re, `.vinyl.playing{
  contain:layout style;
}`)
      return '已改（宽松）'
    }
    return '没找到 8s 规则'
  })

  /* ========== 问题 1：嵌套注释吃掉整条规则 ========== */
  step('[' + f + '] 1. 修嵌套注释', () => {
    /* 找出那段有问题的注释 + 后面被污染的规则 */
    const badBlock = /\/\* 已撤销：\.vinyl-zone > \*[^*]*\*\/[^.]*\.vinyl,\s*\n?\.vinyl-grooves,\s*\n?\.vinyl-label\{[\s\S]*?\}/
    if (badBlock.test(c)) {
      c = c.replace(badBlock, `/* 已撤销（历史记录，勿恢复）：在 .vinyl-zone > * 上写 width/height 100% + aspect-ratio，
   父容器不是正方形时会把唱片拉成椭圆。保持正圆只能靠 .vinyl-zone 自身的 aspect-ratio。 */

.vinyl,
.vinyl-grooves,
.vinyl-label{
  will-change:transform;
  backface-visibility:hidden;
  -webkit-backface-visibility:hidden;
  transform-origin:50% 50%;
}`)
      return '已重写'
    }
    /* 检查有没有落单的 */
    if (c.includes('自身的 aspect-ratio。 */`')) {
      /* 旧版带反引号的污染 */
      c = c.replace(/自身的 aspect-ratio。 \*\/`[^.]*/, `自身的 aspect-ratio。 */\n\n`)
      return '已清理落单的 */'
    }
    return '未匹配，需人工看'
  })

  /* ========== 问题 3+4+6：媒体查询合并成 clamp，加下限 ========== */
  step('[' + f + '] 3/4/6. 媒体查询合并 + clamp 下限', () => {
    /* 删掉那 6 条散装 max-width:min(100%, Nvh) */
    let n = 0
    const strip = [
      /\.vinyl-zone\{\s*max-width:min\(100%,\s*34vh,\s*340px\);\s*\}/g,
      /\.vinyl-zone\{max-width:min\(100%,\s*26vh\)\}/g,
      /\.vinyl-zone\{max-width:min\(100%,\s*22vh\)\}/g,
      /\.vinyl-zone\{max-width:min\(100%,\s*30vh\)\}/g,
      /\.vinyl-zone\{max-width:min\(100%,\s*28vh\)\}/g,
    ]
    for (const re of strip) {
      const m = c.match(re)
      if (m) { c = c.replace(re, '/* merged */'); n += m.length }
    }
    /* 基础规则也改掉，加 clamp 下限 */
    c = c.replace(
      /max-width:min\(100%,\s*34vh\);/,
      'max-width:clamp(160px, 34vh, 340px);'
    )
    return '清掉 ' + n + ' 条散装规则，基础规则加 clamp(160px,...)'
  })

  if (c !== orig) fs.writeFileSync(f, c, 'utf8')
}

/* 追加统一的一套媒体查询 */
const MARK = '/* ==== 唱片尺寸：clamp 统一下限 ==== */'
const patch = `
${MARK}

/* 之前 6 条 max-width:min(100%,Nvh) 特异性相同，后写的无条件覆盖前面的，
   导致「窗口越窄唱片越大」（1181×600 → 132px，1180×600 → 180px）。
   改成所有档位共用一个 clamp 下限，横向和纵向同时受约束。 */

.vinyl-zone{
  width:100%;
  max-width:clamp(160px, 34vh, 340px);
  aspect-ratio:1/1;
  height:auto;
  max-height:none;
  margin:0 auto;
}
@media (max-width:1180px){
  .vinyl-zone{max-width:clamp(150px, 30vh, 340px)}
}
@media (max-width:980px){
  .vinyl-zone{max-width:clamp(140px, 28vh, 320px)}
}
@media (max-width:860px){
  .vinyl-zone{max-width:clamp(130px, 26vh, 300px)}
}
/* 高度档只在下限上生效，不整条覆盖宽度档 */
@media (max-height:720px){
  .vinyl-zone{max-width:clamp(150px, 26vh, 300px)}
}
@media (max-height:640px) and (min-width:981px){
  .vinyl-zone{max-width:clamp(150px, 26vh, 300px)}
}
@media (max-height:570px){
  /* 矮窗兜底：整列可滚，别让 overflow:hidden 把歌词裁掉 */
  .deck{overflow-y:auto}
  #panelLyric.deck-body,
  .deck-body.lyric-body{min-height:96px}
  .deck .deck-plate{display:none}
}
`

for (const f of ['public/style.css', 'mobile/www/style.css']) {
  if (!fs.existsSync(f)) continue
  let c = fs.readFileSync(f, 'utf8')
  if (c.includes(MARK)) { console.log(f + ': clamp 补丁已有'); continue }
  fs.writeFileSync(f, c + patch, 'utf8')
  console.log(f + ': 已追加 clamp 补丁')
}

console.log('\n=== 结果 ===')
const bad = results.filter((r) => !r.ok)
console.log('成功 ' + (results.length - bad.length) + ' / 失败 ' + bad.length)
