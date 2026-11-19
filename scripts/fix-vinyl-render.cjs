'use strict'
/* 唱片「扭动」：加渲染优化 + 锁定宽高比 */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

const MARK = '/* ==== 唱片渲染优化 ==== */'
const patch = `
${MARK}

/* 「唱片会扭动」通常不是 CSS 动画的问题（spin 只有 rotate），
   而是旋转元素在合成层里被反复重绘 + 父容器高度变化时的 layout 抖动。
   这里做三件事：
     1) 把旋转元素提到独立合成层，避免每帧重绘
     2) 锁定它是正方形，height 由宽或高单边决定，绝不两边同时被压
     3) 旋转期间关掉 layout 相关的过渡 */

.vinyl-zone{
  position:relative;
  aspect-ratio:1/1;
}
/* 高度受限时让宽度跟着高度走，保持正圆 */
.vinyl-zone > *{
  width:100%;
  height:100%;
  aspect-ratio:1/1;
}

/* 旋转元素：独立层 + 不回流 */
.vinyl,
.vinyl-grooves,
.vinyl-label{
  will-change:transform;
  backface-visibility:hidden;
  -webkit-backface-visibility:hidden;
  transform-origin:50% 50%;
}
.vinyl.playing{
  animation:spin 8s linear infinite;
  /* 播放时锁死尺寸，避免和父容器高度变化打架 */
  contain:layout paint;
}

/* 唱臂：只做 transform，别让 left/top 参与动画 */
.tonearm,
.tonearm *{
  will-change:transform;
}

/* 黑胶容器本身禁止尺寸过渡（有的人会在 :hover 上写 transition:all） */
.vinyl-zone,
.vinyl-zone *{
  transition-property:transform,opacity,box-shadow;
}
`

for (const f of ['public/style.css', 'mobile/www/style.css']) {
  if (!fs.existsSync(f)) continue
  let c = fs.readFileSync(f, 'utf8')
  if (c.includes(MARK)) { console.log(f + ': 已有'); continue }
  fs.writeFileSync(f, c + patch, 'utf8')
  console.log(f + ': 已追加')
}

/* 检查 .vinyl 的选择器到底叫什么 */
const c1 = fs.readFileSync('public/style.css', 'utf8')
console.log('\n=== 校验选择器是否真实存在 ===')
;['.vinyl', '.vinyl-grooves', '.vinyl-label', '.tonearm'].forEach((sel) => {
  const cnt = (c1.match(new RegExp(sel.replace('.', '\\.') + '[\\s{,:]', 'g')) || []).length
  console.log('  ' + sel + ': ' + cnt + ' 处' + (cnt > 0 ? ' ✓' : ' ⚠ 可能不存在'))
})

/* HTML 里也确认一下 */
const h = fs.readFileSync('public/index.html', 'utf8')
console.log('\n=== HTML 里的实际类名 ===')
const classes = new Set()
const re = /class="([^"]+)"/g
let m
while ((m = re.exec(h))) m[1].split(/\s+/).forEach((x) => classes.add(x))
;['vinyl', 'vinyl-grooves', 'vinyl-label', 'tonearm', 'vinyl-zone', 'plinth'].forEach((k) => {
  console.log('  .' + k + ': ' + (classes.has(k) ? '✓ 存在' : '✗ 不存在'))
})
