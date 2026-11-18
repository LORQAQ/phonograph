'use strict'
/* 手机端顶栏：让搜索框真正可点（之前被压成 0 宽，只能看到放大镜） */
const fs = require('node:fs')

const cssPath = 'public/style.css'
let css = fs.readFileSync(cssPath, 'utf8')

const MARK = '/* ==== 手机端顶栏修正 ==== */'
if (css.includes(MARK)) {
  console.log('补丁已存在')
} else {
  const patch = `
${MARK}
@media (max-width: 860px) {
  /* 搜索区必须有最小宽度，否则 input 被 flex 压到 0，点不到 */
  .search-wrap { min-width: 0; flex: 1 1 auto; }
  .search-wrap .search-ico { display: none; }
  .search-wrap input { min-width: 0; flex: 1 1 auto; font-size: 13px; padding: 0 2px; }
  .search-wrap input::placeholder { font-size: 12.5px; }
  .btn-search { flex-shrink: 0; padding: 5px 10px; font-size: 12.5px; }
  .clear-btn { flex-shrink: 0; }

  /* 顶栏整体不要挤压搜索框 */
  .topbar { gap: 6px; }
  .brand { flex-shrink: 0; }
  .brand-txt b { font-size: 16px; }
  .top-right { flex-shrink: 0; gap: 3px; }
  .top-right select { max-width: 92px; padding: 5px 3px; font-size: 11.5px; }
  .top-btn { padding: 5px 6px; }
}
`
  css += patch
  fs.writeFileSync(cssPath, css, 'utf8')
  console.log('手机端搜索框修正已加入')
}

/* 验证 */
const check = css.includes(MARK)
console.log('补丁存在:', check)

/* 顺便查一下那个问号 */
const html = fs.readFileSync('public/index.html', 'utf8')
const qIdx = html.indexOf('>?<')
console.log('HTML 中 ">?<" 位置:', qIdx)
if (qIdx > 0) {
  console.log('上下文:', html.slice(Math.max(0, qIdx - 200), qIdx + 50))
}
/* 查 app.js 里有没有动态插入 ? 的地方 */
const js = fs.readFileSync('public/app.js', 'utf8')
const qs = js.match(/.{60}['"]\?['"].{60}/g)
if (qs) {
  console.log('\napp.js 中的独立 "?" 字面量:')
  qs.slice(0, 5).forEach((x) => console.log('  ' + x.replace(/\n/g, ' ').slice(0, 140)))
}
