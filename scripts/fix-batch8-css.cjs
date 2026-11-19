'use strict'
/* 第 8 批 CSS：B68 / B69 / B71 / B72 */
process.chdir(require('node:path').resolve(__dirname, '..'))
const fs = require('node:fs')
const done = []

const MARK = '/* ==== BUG-REPORT-2 布局收尾 ==== */'
const patch = `
${MARK}

/* --- B71: 移动端 100vh 不随动态视口变化，软键盘/工具栏出现时底部被裁 --- */
#app {
  height: 100vh;
  height: 100dvh;
}
@supports not (height: 100dvh) {
  #app { height: 100vh; }
}

/* --- B68: 窗口矮的时候，正方形唱片区把歌词面板挤成 0 并被 overflow 裁掉 --- */
.vinyl-zone {
  max-height: min(42vh, 100%);
}
.deck-body {
  min-height: 120px;
}
@media (max-height: 720px) {
  .deck .plinth { padding: 10px 10px 8px; }
  .deck-info h1 { font-size: 17px; }
}

/* --- B72: 进度条热区（::before ±14px）盖住了控制按钮顶部约 8px，
       点播放/上一首/下一首的最上缘会变成跳进度 --- */
@media (max-width: 860px) {
  .progress-row {
    pointer-events: none;
  }
  .progress {
    pointer-events: auto;
  }
  .progress::before {
    top: -6px !important;
    bottom: -10px !important;
  }
}

/* --- B69: 两条移动端规则打不中真实 DOM --- */
/* enhanceSelect 把原生 select 包进 .dd，可见的是 .dd-btn；
   #qualitySelect{display:none} 只作用在已被隐藏的 select 上，包装器不受影响。
   JS 侧会给包装器打 data-for-sel，这里据此隐藏。 */
@media (max-width: 860px) {
  .dd[data-for-sel="qualitySelect"] {
    display: none !important;
  }
}
`

for (const p of ['public/style.css', 'mobile/www/style.css']) {
  let c = fs.readFileSync(p, 'utf8')
  if (c.includes(MARK)) { console.log(p + ': 已有'); continue }
  fs.writeFileSync(p, c + patch, 'utf8')
  done.push(p)
}

/* --- B69 另一半：JS 给 .dd 包装器打标记 --- */
{
  const p = 'public/app.js'
  let s = fs.readFileSync(p, 'utf8')
  if (!s.includes('dataset.forSel')) {
    const anchor = 'sel.dataset.dd = \'1\''
    if (s.includes(anchor)) {
      s = s.replace(anchor, `sel.dataset.dd = '1'
  /* B69: 给包装器打标记，好让 CSS 能按 select 的 id 隐藏 */
  try { wrap.dataset.forSel = sel.id || '' } catch (e) { }`)
      fs.writeFileSync(p, s, 'utf8')
      done.push('B69 JS 打 data-for-sel')
    } else {
      const i = s.indexOf('function enhanceSelect')
      if (i > 0) console.log('  B69 现场:\n' + s.slice(i, i + 700))
    }
  } else {
    done.push('B69 JS 已有 data-for-sel')
  }
}

/* --- B69 第三处：顶栏按钮里的裸文本节点包成 span --- */
{
  const p = 'public/index.html'
  let h = fs.readFileSync(p, 'utf8')
  let n = 0
  h = h.replace(/(<button class="top-btn" id="btnOpenSources"><svg><use href="#i-plug"\/><\/svg>)(音源)(<\/button>)/g,
    (m, a, b, c) => { n++; return a + '<span>' + b + '</span>' + c })
  h = h.replace(/(<button class="top-btn" id="btnOpenSettings"><svg><use href="#i-gear"\/><\/svg>)(设置)(<\/button>)/g,
    (m, a, b, c) => { n++; return a + '<span>' + b + '</span>' + c })
  if (n > 0) {
    fs.writeFileSync(p, h, 'utf8')
    done.push('B69 顶栏按钮文字包 span × ' + n)
  } else {
    const i = h.indexOf('btnOpenSources')
    if (i > 0) console.log('  B69 HTML 现场:\n' + h.slice(i - 60, i + 180))
  }
}

console.log('=== 已完成 ===')
done.forEach((d) => console.log('  ✓ ' + d))
