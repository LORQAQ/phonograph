'use strict'
/* 上一版用 ::before 扩展热区无效（伪元素不接事件）
   改成给 .progress 加 padding，真正扩大可点区域 */
const fs = require('node:fs')

const MARK = '/* ==== 进度条热区 v2 ==== */'
const patch = `
${MARK}
/* 关键：用 padding 扩大真实可点区域，background-clip 保证视觉上还是细条 */
.progress {
  height: 3px !important;
  padding: 13px 0 !important;
  box-sizing: content-box !important;
  background-clip: content-box !important;
  border-radius: 2px;
  touch-action: none;
  cursor: pointer;
}
/* 去掉上一版无效的伪元素热区 */
.progress::before {
  content: none !important;
}

@media (max-width: 860px) {
  .progress {
    height: 5px !important;
    padding: 14px 0 !important;
    border-radius: 3px;
  }
  .progress-dot {
    opacity: 1 !important;
    width: 14px !important;
    height: 14px !important;
    box-shadow: 0 1px 5px rgba(0,0,0,.3);
  }
  .progress-row {
    padding: 4px 0 !important;
  }
  .progress-row #curTime,
  .progress-row #totalTime {
    font-size: 11.5px !important;
    min-width: 34px;
  }
}

/* 拖动中的视觉反馈 */
.progress.dragging {
  height: 7px !important;
}
.progress.dragging .progress-dot {
  opacity: 1 !important;
  transform: translate(-50%, -50%) scale(1.3);
}

/* 内部元素要跟着条走（padding 会影响定位基准） */
.progress-inner {
  top: 50% !important;
  transform: translateY(-50%);
  height: 100% !important;
  border-radius: 2px;
}
.progress-dot {
  top: 50% !important;
}
.progress-float {
  top: -22px !important;
}
`

let count = 0
for (const p of ['public/style.css', 'mobile/www/style.css']) {
  let c = fs.readFileSync(p, 'utf8')
  if (c.includes(MARK)) {
    console.log(p + ': 已有 v2')
    continue
  }
  fs.writeFileSync(p, c + patch, 'utf8')
  count++
  console.log(p + ': 已加 v2 热区')
}

console.log('\n共修改 ' + count + ' 个文件')
