'use strict'
/* 撤销 padding 方案（撑破布局导致错位），恢复 ::before 热区 */
const fs = require('node:fs')

const MARK = '/* ==== 进度条热区 v3 ==== */'
const patch = `
${MARK}
/* v2 的 padding 会把条撑高挤坏布局，撤回。
   改用绝对定位伪元素扩展热区（不占布局空间） */
.progress {
  height: 3px !important;
  padding: 0 !important;
  box-sizing: border-box !important;
  background-clip: border-box !important;
  position: relative;
  touch-action: none;
  cursor: pointer;
  /* 关键：不能 overflow:hidden，否则伪元素超出部分不可点 */
  overflow: visible !important;
}
.progress::before {
  content: '' !important;
  position: absolute !important;
  left: 0 !important;
  right: 0 !important;
  top: -14px !important;
  bottom: -14px !important;
  height: auto !important;
  background: transparent !important;
  transform: none !important;
  z-index: 0 !important;
  /* 伪元素属于 .progress，事件目标仍是 .progress */
}

@media (max-width: 860px) {
  .progress {
    height: 5px !important;
  }
  .progress::before {
    top: -16px !important;
    bottom: -16px !important;
  }
  .progress-dot {
    opacity: 1 !important;
    width: 14px !important;
    height: 14px !important;
    box-shadow: 0 1px 5px rgba(0,0,0,.3);
  }
  .progress-row #curTime,
  .progress-row #totalTime {
    font-size: 11.5px !important;
    min-width: 34px;
  }
}

.progress.dragging {
  height: 7px !important;
}
.progress.dragging .progress-dot {
  opacity: 1 !important;
  transform: translate(-50%, -50%) scale(1.3);
}

/* 内部元素恢复默认定位（v2 加的 top/transform 要清掉） */
.progress-inner {
  top: 0 !important;
  transform: none !important;
  height: 100% !important;
}
.progress-dot {
  top: 50% !important;
}
`

let count = 0
for (const p of ['public/style.css', 'mobile/www/style.css']) {
  let c = fs.readFileSync(p, 'utf8')
  if (c.includes(MARK)) {
    console.log(p + ': 已有 v3')
    continue
  }
  fs.writeFileSync(p, c + patch, 'utf8')
  count++
  console.log(p + ': 已加 v3')
}

console.log('\n共修改 ' + count + ' 个文件')
