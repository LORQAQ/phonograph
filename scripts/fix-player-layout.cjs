'use strict'
/* 进度条区域被 player 的 grid 挤成 8px 高，时间文字和进度条都看不见
   修：player 改成 flex 纵向 + 高度 auto，progress-row 独占一行 */
const fs = require('node:fs')

const MARK = '/* ==== 播放器布局修复 ==== */'
const patch = `
${MARK}
/* player 原本 grid-template-rows: 61px 单行，progress-row 被挤成 8px */
.player {
  display: flex !important;
  flex-direction: column;
  height: auto !important;
  min-height: 84px;
  gap: 0;
  padding: 6px 12px 8px;
  box-sizing: border-box;
}
.player > .controls {
  display: flex;
  align-items: center;
  height: auto !important;
  min-height: 40px;
  width: 100%;
}
.player > .progress-row {
  display: flex !important;
  align-items: center;
  gap: 8px;
  height: auto !important;
  min-height: 22px;
  width: 100%;
  margin-top: 2px;
}
.player > .progress-row > #curTime,
.player > .progress-row > #totalTime {
  flex: 0 0 auto;
  font-size: 11.5px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

@media (max-width: 860px) {
  .player {
    min-height: 92px;
    padding: 8px 12px calc(8px + env(safe-area-inset-bottom, 0px));
  }
  .player > .controls {
    min-height: 46px;
  }
  .player > .progress-row {
    min-height: 24px;
  }
  .player > .progress-row > #curTime,
  .player > .progress-row > #totalTime {
    font-size: 12px;
    min-width: 36px;
    text-align: center;
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
  console.log(p + ': 已修播放器布局')
}

console.log('\n共修改 ' + count + ' 个文件')
