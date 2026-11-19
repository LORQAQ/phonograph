'use strict'
/* 第二轮 CSS：黑胶区进一步压缩，让歌词区在各种宽度下都有足够空间 */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

const MARK = '/* ==== 黑胶区高度再收紧 ==== */'
const patch = `
${MARK}

/* 上一版只在 <=860px 收紧，但平板横屏常见 1024~1280，
   大屏 1920 也吃不到那个断点 —— 结果黑胶还是占掉一半屏。
   这里改成所有宽度都给一个上限，用 vh 保证竖向永远有余量。 */

.deck{
  display:flex;
  flex-direction:column;
  min-height:0;
  overflow:hidden;
}
.deck-vinyl,
.deck > .plinth{
  flex-shrink:0;
}

/* 黑胶区：竖向最多 38vh，绝对上限 340px */
.vinyl-zone{
  max-height:min(38vh,340px);
  margin:0 auto;
}
@media (min-width:861px) and (max-aspect-ratio:1/1){
  .vinyl-zone{
    width:auto;
    height:min(38vh,340px);
    max-height:min(38vh,340px);
    aspect-ratio:1/1;
  }
}

/* 歌词区：抢到剩下的全部高度 */
#panelLyric.deck-body,
.deck-body.lyric-body{
  flex:1 1 auto;
  min-height:120px;
  overflow:hidden;
  display:flex;
  flex-direction:column;
}
#panelLyric .lyric-roll,
.deck-body.lyric-body .lyric-roll{
  flex:1 1 auto;
  height:auto;
  min-height:0;
  overflow-y:auto;
}

/* 再窄一点时连 plinth 的留白也收 */
@media (max-width:1180px){
  .vinyl-zone{max-height:min(34vh,300px)}
  .plinth{padding:12px 12px 8px}
}
@media (max-width:980px){
  .vinyl-zone{max-height:min(30vh,260px)}
}
@media (max-width:860px){
  .vinyl-zone{max-height:min(28vh,240px)}
}
`

for (const f of ['public/style.css', 'mobile/www/style.css']) {
  if (!fs.existsSync(f)) continue
  let c = fs.readFileSync(f, 'utf8')
  if (c.includes(MARK)) { console.log(f + ': 已有'); continue }
  fs.writeFileSync(f, c + patch, 'utf8')
  console.log(f + ': 已追加')
}

const c1 = fs.readFileSync('public/style.css', 'utf8')
console.log('\n确认:')
console.log('  .deck flex:', /\.deck\{[\s\S]{0,200}display:flex/.test(c1) ? '✓' : '✗')
console.log('  38vh 上限:', c1.includes('min(38vh,340px)') ? '✓' : '✗')
console.log('  歌词 min-height:', c1.includes('min-height:120px') ? '✓' : '✗')
