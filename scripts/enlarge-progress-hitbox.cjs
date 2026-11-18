'use strict'
/* 进度条太细（3px），手机上点不中。
   视觉保持细，但用 ::before 把点击热区扩到 24px */
const fs = require('node:fs')

const MARK = '/* ==== 进度条热区 ==== */'
const patch = `
${MARK}
/* 视觉上还是细条，但点击/拖动热区扩到 24px */
.progress {
  position: relative;
}
.progress::before {
  content: '';
  position: absolute;
  left: -4px;
  right: -4px;
  top: 50%;
  height: 28px;
  transform: translateY(-50%);
  /* 透明，只接收指针事件 */
  background: transparent;
  z-index: 1;
}
/* 进度点和填充要在热区之上 */
.progress-inner { position: relative; z-index: 2; }
.progress-dot { z-index: 3; }
.progress-float { z-index: 4; }

/* 移动端：条本身也加粗一点，进度点常显 */
@media (max-width: 860px) {
  .progress {
    height: 5px !important;
    border-radius: 3px;
    touch-action: none;          /* 防止拖动时页面滚动 */
  }
  .progress-dot {
    opacity: 1 !important;        /* 常显，让用户知道能拖 */
    width: 13px;
    height: 13px;
    box-shadow: 0 1px 4px rgba(0,0,0,.28);
  }
  .progress-row {
    padding: 6px 0;               /* 上下留白，手指更好点 */
  }
  .progress-row #curTime,
  .progress-row #totalTime {
    font-size: 11.5px;
    min-width: 34px;
  }
}

/* 拖动时高亮 */
.progress.dragging { height: 7px !important; }
.progress.dragging .progress-dot { opacity: 1 !important; transform: translate(-50%, -50%) scale(1.25); }
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
  console.log(p + ': 已加进度条热区')
}

console.log('\n共修改 ' + count + ' 个文件')
