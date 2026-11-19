'use strict'
/* 第三轮 CSS：针对平板横屏（1200x678 这类）优化竖向分配 */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

const MARK = '/* ==== 平板横屏竖向分配 ==== */'
const patch = `
${MARK}

/* 实测平板横屏 1200x678 时：
     黑胶 ~265px + info ~130px + tabs ~30px + 歌词 ~120px
   歌词只能显示一两行，还被底栏压住。
   这一段按「歌词优先」重新分配。 */

/* 1) 信息区收紧凑：字号、间距、行高都压一档 */
.deck-info{
  gap:1px;
  padding:0 2px;
  flex-shrink:0;
}
.deck-info h1{font-size:17px;line-height:1.25}
.deck-info p{font-size:12px;line-height:1.3}
.deck-info .src-badge{font-size:9.5px;line-height:1.2;margin-top:0}
.deck-tabs{padding:1px 0 4px}
.deck-tabs-label{font-size:10px}

/* 2) 黑胶区再压一档 */
.vinyl-zone{max-height:min(32vh,280px)}

/* 3) 歌词区拿够高度 —— 这是主诉求 */
#panelLyric.deck-body,
.deck-body.lyric-body{
  flex:1 1 auto;
  min-height:150px;
  overflow:hidden;
  display:flex;
  flex-direction:column;
  padding:6px 0 4px;
}
#panelLyric .lyric-roll,
.deck-body.lyric-body .lyric-roll{
  flex:1 1 auto;
  height:auto;
  min-height:0;
  overflow-y:auto;
}
/* 歌词字号在窄屏下略微收一点，多显示几行 */
.lyric-roll .ll{font-size:13px;line-height:1.7}

/* 4) 更矮的窗口（比如 617 高）再压黑胶 */
@media (max-height:720px){
  .vinyl-zone{max-height:min(26vh,220px)}
  .deck-info h1{font-size:15.5px}
  .deck-info p{font-size:11.5px}
  #panelLyric.deck-body,
  .deck-body.lyric-body{min-height:130px}
}
@media (max-height:640px){
  .vinyl-zone{max-height:min(22vh,190px)}
  .deck-info h1{font-size:14.5px}
  .deck-tabs{padding:0 0 3px}
}
`

for (const f of ['public/style.css', 'mobile/www/style.css']) {
  if (!fs.existsSync(f)) continue
  let c = fs.readFileSync(f, 'utf8')
  if (c.includes(MARK)) { console.log(f + ': 已有'); continue }
  fs.writeFileSync(f, c + patch, 'utf8')
  console.log(f + ': 已追加')
}

/* 同时检查唱片有没有奇怪的动画 */
const c1 = fs.readFileSync('public/style.css', 'utf8')
console.log('\n=== 唱片动画检查 ===')
const anims = []
const re = /@keyframes\s+([\w-]+)\s*\{[\s\S]*?\n\}/g
let m
while ((m = re.exec(c1))) anims.push(m[1])
console.log('keyframes: ' + (anims.join(', ') || '无'))
const spin = c1.match(/\.vinyl[\s\S]{0,200}animation[^;]*;/)
console.log('vinyl animation: ' + (spin ? spin[0].replace(/\s+/g, ' ').slice(0, 120) : '无'))
/* 检查有没有 scale / skew 之类的变形 */
const distort = c1.match(/[^-]transform:[^;]*(scale|skew|matrix)[^;]*;/g)
console.log('变形变换: ' + (distort ? distort.slice(0, 3).join(' | ') : '无'))
