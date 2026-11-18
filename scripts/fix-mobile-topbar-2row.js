'use strict'
/* 手机端顶栏改成两行：第一行 logo + 设置，第二行搜索框占满宽度 */
const fs = require('node:fs')

const cssPath = 'public/style.css'
let css = fs.readFileSync(cssPath, 'utf8')

const MARK = '/* ==== 手机端顶栏两行布局 ==== */'
if (css.includes(MARK)) {
  console.log('两行布局补丁已存在')
} else {
  const patch = `
${MARK}
@media (max-width: 860px) {
  /* 顶栏高度改成自适应，否则两行会被裁掉 */
  :root { --top-h: auto; }
  #app { grid-template-rows: auto minmax(0, 1fr) var(--player-h) var(--tab-h); }

  .topbar {
    flex-wrap: wrap;
    height: auto;
    padding: 8px 12px 10px;
    gap: 8px 10px;
    align-content: center;
  }

  /* 第一行：品牌 + 右侧按钮 */
  .brand { order: 1; flex-shrink: 0; }
  .brand-txt b { font-size: 16px; letter-spacing: .5px; }
  .nav-history { display: none; }

  .top-right { order: 2; margin-left: auto; flex-shrink: 0; gap: 6px; }
  #qualitySelect { display: none; }           /* 手机上音质选择没必要，藏掉 */
  .top-right select { max-width: 118px; padding: 6px 4px; font-size: 12px; }
  .top-btn { padding: 6px 8px; }
  .top-btn span { display: none; }

  /* 第二行：搜索框独占一行 */
  .search-wrap {
    order: 10;
    flex: 1 0 100%;
    max-width: none;
    height: 38px;
    min-width: 0;
    padding: 0 4px 0 12px;
  }
  .search-wrap .search-ico { display: none; }
  .search-wrap input {
    flex: 1 1 auto;
    min-width: 0;
    font-size: 14px;
    padding: 0 4px;
  }
  .search-wrap input::placeholder { font-size: 13px; }
  .btn-search {
    flex-shrink: 0;
    height: 30px;
    padding: 0 14px;
    font-size: 13px;
  }
  .clear-btn { flex-shrink: 0; }
}
`
  css += patch
  fs.writeFileSync(cssPath, css, 'utf8')
  console.log('两行布局补丁已加入')
}

/* 组装到手机端 */
const mobileCss = 'mobile/www/style.css'
if (fs.existsSync(mobileCss)) {
  let mc = fs.readFileSync(mobileCss, 'utf8')
  if (!mc.includes(MARK)) {
    mc += css.slice(css.indexOf(MARK))
    fs.writeFileSync(mobileCss, mc, 'utf8')
    console.log('手机端 CSS 已同步')
  } else {
    console.log('手机端 CSS 已有补丁')
  }
}
