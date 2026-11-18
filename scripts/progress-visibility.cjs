'use strict'
/* 进度条底色太浅（--border = #dfe5db）在米色背景上几乎看不见
   加深底色 + 拖动点加大，保持布局不变 */
const fs = require('node:fs')

const MARK = '/* ==== 进度条可见性 ==== */'
const patch = `
${MARK}
/* 底色加深，让细条也能看见（不动尺寸和布局） */
.progress {
  background: rgba(40, 50, 40, .16) !important;
  box-shadow: inset 0 0 0 1px rgba(40, 50, 40, .06);
}
.progress-inner {
  background: var(--accent, #2f7d4f) !important;
  box-shadow: 0 0 6px rgba(47, 125, 79, .4);
}
.progress::before {
  content: '' !important;
  position: absolute !important;
  left: 0 !important;
  right: 0 !important;
  top: -12px !important;
  bottom: -12px !important;
  background: transparent !important;
  pointer-events: auto !important;
}

@media (max-width: 860px) {
  .progress {
    height: 5px !important;
    background: rgba(40, 50, 40, .2) !important;
    border-radius: 3px;
    touch-action: none;
  }
  .progress::before {
    top: -14px !important;
    bottom: -14px !important;
  }
  .progress-dot {
    opacity: 1 !important;
    width: 13px !important;
    height: 13px !important;
    background: #fff !important;
    border: 2px solid var(--accent, #2f7d4f);
    box-shadow: 0 1px 4px rgba(0, 0, 0, .28);
  }
  .progress.dragging {
    height: 7px !important;
  }
  .progress.dragging .progress-dot {
    transform: translate(-50%, -50%) scale(1.3);
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
  console.log(p + ': 已加可见性增强')
}

console.log('\n共修改 ' + count + ' 个文件')
