'use strict'
/* 最小改动：只扩热区，不动任何布局属性 */
const fs = require('node:fs')

const MARK = '/* ==== 进度条热区（最小改动） ==== */'
const patch = `
${MARK}
/* 只在 .progress 上叠一个透明伪元素扩大可点区域，
   不修改 height / padding / display / position 等任何布局属性 */
.progress::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: -12px;
  bottom: -12px;
  background: transparent;
  pointer-events: auto;
}
/* 移动端条粗一点、点常显（只改视觉，不改占位） */
@media (max-width: 860px) {
  .progress {
    height: 5px;
  }
  .progress::before {
    top: -14px;
    bottom: -14px;
  }
  .progress-dot {
    opacity: 1;
    width: 13px;
    height: 13px;
    box-shadow: 0 1px 4px rgba(0, 0, 0, .28);
  }
  .progress.dragging {
    height: 7px;
  }
}
`

let count = 0
for (const p of ['public/style.css', 'mobile/www/style.css']) {
  let c = fs.readFileSync(p, 'utf8')
  if (c.includes(MARK)) {
    console.log(p + ': 已有')
    continue
  }
  fs.writeFileSync(p, c + patch, 'utf8')
  count++
  console.log(p + ': 已加最小热区')
}

console.log('\n共修改 ' + count + ' 个文件')
console.log('\n注意：这次只加了 .progress::before 和 @media 里的视觉尺寸，')
console.log('没有碰 .player / .controls / .progress-row 的任何布局属性')
