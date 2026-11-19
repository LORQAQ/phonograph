'use strict'
/* 修：
   1. .src-badge 没有 CSS → 音源名称字号太大、颜色不对，破坏排版
   2. .vinyl-zone{width:100%;aspect-ratio:1/1} 在平板下高度=宽度，把歌词区挤成 0
   3. .lyric-roll{height:100%} 在 flex 里算不准
   —— 全部用追加 CSS 的方式，不动现有规则（避免连锁改坏）
*/
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

const MARK = '/* ==== 音源标签 + 歌词区高度修正 ==== */'
const patch = `
${MARK}

/* ---- 1. 音源标签：跟 npSinger 同一档，弱化成辅助信息 ---- */
.deck-info .src-badge{
  display:block;
  margin-top:1px;
  font-family:var(--mono);
  font-size:10px;
  letter-spacing:.6px;
  color:var(--text-3);
  opacity:.85;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
/* 空的时候不占位，避免「未在播放」时多一条空白 */
.deck-info .src-badge:empty{display:none}

/* ---- 2. 黑胶区高度封顶 ----
   原来 aspect-ratio:1/1 + width:100%，平板/横屏下宽度等于容器宽度，
   高度也就等于宽度，直接把下面的歌词区挤成 0。 */
.vinyl-zone{
  aspect-ratio:1/1;
  width:100%;
  max-width:100%;
  /* 竖向空间最多占 46vh，且不超过 420px */
  max-height:min(46vh,420px);
  margin:0 auto;
}
/* 宽屏时用高度反推宽度，保证还是正方形 */
@media (min-width:861px) and (max-aspect-ratio:1/1){
  .vinyl-zone{
    width:auto;
    height:min(46vh,420px);
    aspect-ratio:1/1;
  }
}

/* ---- 3. 歌词区：让它真正拿到剩余高度 ----
   .deck-body 是 flex:1 + overflow-y:auto，里面的 .lyric-roll 再 height:100%
   会按「内容高度」算，滚动容器和内容互相依赖。改成让 .lyric-roll 自己滚。 */
#panelLyric.deck-body{
  overflow:hidden;
  display:flex;
  flex-direction:column;
}
#panelLyric .lyric-roll{
  flex:1 1 auto;
  height:auto;
  min-height:0;
  overflow-y:auto;
}

/* ---- 4. 平板/窄屏下再收一点 ---- */
@media (max-width:1180px){
  .vinyl-zone{max-height:min(40vh,360px)}
  .deck-info h1{font-size:18px}
}
@media (max-width:980px){
  .vinyl-zone{max-height:min(36vh,320px)}
}
@media (max-width:860px){
  .vinyl-zone{max-height:min(34vh,300px)}
}
`

for (const f of ['public/style.css', 'mobile/www/style.css']) {
  if (!fs.existsSync(f)) { console.log('跳过 ' + f); continue }
  let c = fs.readFileSync(f, 'utf8')
  if (c.includes(MARK)) { console.log(f + ': 已打补丁'); continue }
  fs.writeFileSync(f, c + patch, 'utf8')
  console.log(f + ': 已追加 ' + patch.length + ' 字节')
}

/* 确认 */
const c1 = fs.readFileSync('public/style.css', 'utf8')
console.log('\n=== 确认 ===')
console.log('src-badge 样式:', c1.includes('.deck-info .src-badge') ? '✓' : '✗')
console.log('vinyl-zone max-height:', c1.includes('max-height:min(46vh,420px)') ? '✓' : '✗')
console.log('lyric-roll flex:', c1.includes('#panelLyric .lyric-roll') ? '✓' : '✗')
