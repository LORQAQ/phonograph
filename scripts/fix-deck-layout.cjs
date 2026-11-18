'use strict'
/* 播放页(m-deck)布局修复：
   我把 --top-h 改成 auto 后，`.m-deck .deck{ inset: var(--top-h) 0 ... }` 失效
   改成固定像素，不再依赖变量 */
const fs = require('node:fs')
const p = 'mobile/www/style.css'
let c = fs.readFileSync(p, 'utf8')

const oldRule = `.m-deck .deck{ display:flex;position:fixed;inset:var(--top-h) 0 calc(var(--player-h) + var(--tab-h)) 0;z-index:90; background:var(--bg);border:none;padding:14px 16px 0;overflow-y:a`

/* 找到完整规则 */
const re = /\.m-deck \.deck\{[^}]*\}/
const before = (c.match(re) || [''])[0]
console.log('修改前:\n' + before)

const replacement = `.m-deck .deck{
  display:flex;
  position:fixed;
  left:0; right:0;
  top:0; bottom:calc(var(--player-h) + var(--tab-h));
  padding:calc(112px + env(safe-area-inset-top, 0px)) 16px 0;
  z-index:90;
  background:var(--bg);
  border:none;
  overflow-y:auto;
  overscroll-behavior:contain;
}`

if (re.test(c)) {
  c = c.replace(re, replacement)
  fs.writeFileSync(p, c, 'utf8')
  console.log('\n修改后:\n' + (c.match(re) || [''])[0])
} else {
  console.log('未找到 .m-deck .deck 规则')
}

/* 同时补：移动端 deck 内部排版更紧凑，歌词区占满剩余空间 */
const MARK = '/* ==== 播放页移动端排版 ==== */'
if (!c.includes(MARK)) {
  c += `
${MARK}
@media (max-width: 860px) {
  .m-deck .deck .plinth { max-width: 240px; margin: 0 auto; }
  .m-deck .vinyl-zone { max-width: 200px; }
  .m-deck .deck-info h1 { font-size: 18px; }
  .m-deck .deck-info p { font-size: 12.5px; }
  .m-deck .deck-tabs { margin-top: 8px; }
  /* 歌词滚动区：占满剩余高度 */
  .m-deck .lyric-roll,
  .m-deck #lyricRoll {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    padding-bottom: 20px;
  }
  .m-deck .ll { font-size: 15.5px; line-height: 1.95; }
  .m-deck .ll.active { font-size: 18px; font-weight: 700; }
}
`
  fs.writeFileSync(p, c, 'utf8')
  console.log('\n播放页移动端排版已加')
}

/* ---------- 同步到 public（电脑端样式保持一致） ---------- */
const pc = 'public/style.css'
if (fs.existsSync(pc)) {
  let pcs = fs.readFileSync(pc, 'utf8')
  /* 只同步 .m-deck .deck 那条（电脑端也需要，横屏窄窗口会用到） */
  const pre = /\.m-deck \.deck\{[^}]*\}/
  if (pre.test(pcs)) {
    pcs = pcs.replace(pre, replacement)
    fs.writeFileSync(pc, pcs, 'utf8')
    console.log('public/style.css 已同步')
  }
}
