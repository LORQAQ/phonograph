'use strict'
/* 两个问题：
   1) 播放页歌词区空白（#lyricRoll 没高度/被隐藏）
   2) 歌词页不自动滚动（translateY 和 overflow 冲突） */
const fs = require('node:fs')

/* ---------- CSS ---------- */
const cp = 'mobile/www/style.css'
let c = fs.readFileSync(cp, 'utf8')

const MARK = '/* ==== 歌词区显示+滚动修复 ==== */'
if (!c.includes(MARK)) {
  c += `
${MARK}
/* ① 播放页（唱机面板）里的歌词滚动区：必须有高度，否则看不见 */
.m-deck #lyricRoll,
.m-deck .lyric-roll {
  display: block !important;
  flex: 1 1 auto !important;
  min-height: 140px !important;
  max-height: none !important;
  height: auto !important;
  overflow-y: auto !important;
  padding: 8px 2px 24px !important;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
}
.m-deck #lyricRoll .ll {
  display: block;
  padding: 7px 2px;
  font-size: 15.5px;
  line-height: 1.9;
  color: var(--text-2);
  opacity: .72;
  transition: color .2s, opacity .2s, font-size .2s;
  cursor: pointer;
}
.m-deck #lyricRoll .ll.active {
  color: var(--accent, #1f9d55);
  opacity: 1;
  font-weight: 700;
  font-size: 18px;
}
.m-deck .deck-tabs-label { color: var(--text-3); }

/* ② 全屏歌词页：滚动容器必须能滚，且不能被 transform 顶掉 */
.lyric-layer #lyricScroll,
#lyricScroll {
  overflow-y: auto !important;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
#lyricScroll::-webkit-scrollbar { width: 0; height: 0; }
/* 用 scrollTop 滚动，所以 inner 上的 transform 必须清掉 */
#lyricInner { transform: none !important; }
`
  fs.writeFileSync(cp, c, 'utf8')
  console.log('歌词区样式已加')
} else {
  console.log('样式已存在')
}

/* ---------- app.js：滚动改成 scrollTop ---------- */
const ap = 'mobile/www/app.js'
let a = fs.readFileSync(ap, 'utf8')

/* 全屏歌词页的 syncLyric：把 translateY 改成 scrollTop */
const oldSync = `  if (idx >= 0 && lines[idx]) {
    const h = $('#lyricScroll').clientHeight / 2
    const offset = lines[idx].offsetTop + lines[idx].clientHeight / 2
    $('#lyricInner').style.transform = \`translateY(\${-offset + h}px)\`
  }`

const newSync = `  if (idx >= 0 && lines[idx]) {
    const sc = $('#lyricScroll')
    if (sc) {
      const h = sc.clientHeight / 2
      const offset = lines[idx].offsetTop + lines[idx].clientHeight / 2
      const target = Math.max(0, offset - h)
      try { sc.scrollTo({ top: target, behavior: 'smooth' }) } catch (e) { sc.scrollTop = target }
    }
  }
  /* 播放页里的歌词也要跟着滚 */
  try { scrollPanelLyric() } catch (e) { }`

if (a.includes(oldSync)) {
  a = a.replace(oldSync, newSync)
  fs.writeFileSync(ap, a, 'utf8')
  console.log('syncLyric 已改用 scrollTop + 同步播放页歌词')
} else {
  console.log('未匹配 syncLyric，尝试宽松替换')
  const i = a.indexOf("$('#lyricInner').style.transform")
  if (i > 0) {
    const ls = a.lastIndexOf('{', i)
    const le = a.indexOf('}', i) + 1
    a = a.slice(0, ls) + `{
      const sc = $('#lyricScroll')
      if (sc) {
        const h = sc.clientHeight / 2
        const offset = lines[idx].offsetTop + lines[idx].clientHeight / 2
        const target = Math.max(0, offset - h)
        try { sc.scrollTo({ top: target, behavior: 'smooth' }) } catch (e) { sc.scrollTop = target }
      }
    }
    try { scrollPanelLyric() } catch (e) { }` + a.slice(le)
    fs.writeFileSync(ap, a, 'utf8')
    console.log('已用宽松方式替换')
  }
}

console.log('完成')
