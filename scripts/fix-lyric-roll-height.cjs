'use strict'
/* 播放页歌词区高度失控（h=3035），必须限制在可视区并允许滚动 */
const fs = require('node:fs')
const p = 'mobile/www/style.css'
let c = fs.readFileSync(p, 'utf8')

const MARK = '/* ==== 播放页歌词区限高 ==== */'
if (!c.includes(MARK)) {
  c += `
${MARK}
@media (max-width: 860px) {
  .m-deck .deck {
    /* 让整个 deck 变成纵向 flex，歌词区吃掉剩余空间 */
    display: flex !important;
    flex-direction: column !important;
    overflow: hidden !important;
  }
  .m-deck .deck .plinth { flex-shrink: 0; }
  .m-deck .deck-info { flex-shrink: 0; }
  .m-deck .deck-tabs { flex-shrink: 0; }

  /* 歌词滚动区：限高 + 可滚 */
  .m-deck #lyricRoll,
  .m-deck .lyric-roll {
    flex: 1 1 auto !important;
    min-height: 0 !important;
    height: auto !important;
    max-height: none !important;
    overflow-y: auto !important;
    overflow-x: hidden !important;
    padding: 6px 2px 60px !important;
    -webkit-overflow-scrolling: touch;
  }
}
`
  fs.writeFileSync(p, c, 'utf8')
  console.log('限高样式已加')
} else {
  console.log('已存在')
}

/* 检查 deck 的父容器结构，确认 lyricRoll 在 deck 里 */
const html = fs.readFileSync('mobile/www/index.html', 'utf8')
const deckStart = html.indexOf('<aside class="deck">')
const deckEnd = html.indexOf('</aside>', deckStart)
const deckHtml = html.slice(deckStart, deckEnd)
console.log('\n=== deck 内部结构 ===')
const tags = [...deckHtml.matchAll(/<(div|h1|p|span)[^>]*class="([^"]*)"/g)]
tags.forEach((m) => console.log('  <' + m[1] + ' class="' + m[2] + '">'))
const ids = [...deckHtml.matchAll(/id="([^"]+)"/g)].map((m) => m[1])
console.log('  ids: ' + ids.join(', '))
