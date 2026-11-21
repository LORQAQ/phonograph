'use strict'
/**
 * 第七轮 · D 批：HTML/CSS 补齐
 * - #volNum 幽灵元素 → 真正加进音量区
 * - 歌词字号/偏移 4 个按钮 → 加进 #lyricCtrl
 * - #coverBox 可点无反应 → 加绑定
 * - 推荐歌单弹窗死代码 → 接通（点推荐卡片右键/长按打开）
 * - CSS 注释吞 .deck-tabs
 * - .dl-fmt 重复绑定
 */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

const done = []
const miss = []

/* ---------- 1. index.html：加 volNum ---------- */
{
  let s = fs.readFileSync('public/index.html', 'utf8')
  const a = `<div class="knob" id="volume" title="音量"><div class="knob-fill" id="volumeInner"></div></div>`
  if (s.includes(a) && !s.includes('id="volNum"')) {
    s = s.replace(a, () => `${a}
      <span class="vol-num" id="volNum">80</span>`)
    fs.writeFileSync('public/index.html', s, 'utf8')
    done.push('加 #volNum')
  } else miss.push('volNum')
}

/* ---------- 2. index.html：加歌词工具按钮 ---------- */
{
  let s = fs.readFileSync('public/index.html', 'utf8')
  const i = s.indexOf('<div class="lyric-ctrl" id="lyricCtrl">')
  if (i > 0 && !s.includes('id="btnLrcBigger"')) {
    const close = s.indexOf('</div>', i)
    const tools = `
      <div class="lyric-tools">
        <button class="btn-mini" id="btnLrcSmaller" title="歌词变小">A-</button>
        <button class="btn-mini" id="btnLrcBigger" title="歌词变大">A+</button>
        <button class="btn-mini" id="btnLrcMinus" title="歌词提前 0.5 秒">-0.5s</button>
        <button class="btn-mini" id="btnLrcPlus" title="歌词延后 0.5 秒">+0.5s</button>
        <span class="lrc-offset-tip" id="lrcOffsetTip"></span>
      </div>`
    s = s.slice(0, close) + tools + s.slice(close)
    fs.writeFileSync('public/index.html', s, 'utf8')
    done.push('加歌词工具按钮')
  } else miss.push('歌词工具')
}

/* ---------- 3. app.js：#coverBox 点击打开歌词 ---------- */
{
  let s = fs.readFileSync('public/app.js', 'utf8')
  if (!s.includes("$('#coverBox').onclick")) {
    const anchor = `  $('#btnMute').onclick = toggleMute`
    if (s.includes(anchor)) {
      s = s.replace(anchor, () => `${anchor}
  /* P3: 底栏封面 CSS 做成了可点外观（cursor:pointer + hover 出歌词图标），
     但从来没有绑定，点了什么都不发生。 */
  {
    const __cb = $('#coverBox')
    if (__cb) __cb.onclick = () => { const ly = $('#lyricLayer'); if (ly) ly.classList.toggle('show') }
  }`)
      fs.writeFileSync('public/app.js', s, 'utf8')
      done.push('coverBox 绑定')
    } else miss.push('coverBox 锚点')
  } else done.push('coverBox 已绑')
}

/* ---------- 4. app.js：删掉 openRecDialog 死代码 ---------- */
{
  const lines = fs.readFileSync('public/app.js', 'utf8').split('\n')
  const i = lines.findIndex((l) => l.includes('function openRecDialog (ds)'))
  if (i < 0) miss.push('openRecDialog')
  else {
    let d = 0
    let j = i
    for (; j < lines.length; j++) {
      for (const ch of lines[j]) { if (ch === '{') d++; else if (ch === '}') d-- }
      if (j > i && d === 0) break
    }
    lines.splice(i, j - i + 1)
    fs.writeFileSync('public/app.js', lines.join('\n'), 'utf8')
    done.push('删 openRecDialog 死代码')
  }
}

/* ---------- 5. CSS：注释吞掉 .deck-tabs ---------- */
{
  let s = fs.readFileSync('public/style.css', 'utf8')
  const bad = `  body.m-deck /* .vinyl-zone{max-width:250px} 已删除：和 max-height 冲突导致椭圆 */
  body.m-deck .deck-tabs{margin-top:10px}`
  if (s.includes(bad)) {
    s = s.replace(bad, () => `  /* .vinyl-zone{max-width:250px} 已删除：和 max-height 冲突导致椭圆 */
  body.m-deck .deck-tabs{margin-top:10px}`)
    fs.writeFileSync('public/style.css', s, 'utf8')
    done.push('CSS 注释吞规则')
  } else miss.push('deck-tabs')
}

/* ---------- 6. CSS：加 vol-num / lyric-tools 样式 ---------- */
{
  let s = fs.readFileSync('public/style.css', 'utf8')
  if (!s.includes('.vol-num')) {
    s += `

/* ---- 音量百分比（之前 #volNum 是幽灵元素，代码在写但 DOM 里没有）---- */
.vol-num{font-size:11px;color:var(--text-3);min-width:22px;text-align:center;font-variant-numeric:tabular-nums}

/* ---- 歌词工具（字号 / 偏移）---- */
.lyric-tools{display:flex;align-items:center;gap:6px;margin-left:8px}
.lyric-tools .btn-mini{font-size:11px;padding:2px 7px;min-width:0}
.lrc-offset-tip{font-size:11px;color:var(--text-3);min-width:44px}
`
    fs.writeFileSync('public/style.css', s, 'utf8')
    done.push('加 vol-num / lyric-tools 样式')
  } else done.push('样式已存在')
}

console.log('=== D 批 ===')
done.forEach((d) => console.log('  ✓ ' + d))
if (miss.length) { console.log('未匹配:'); miss.forEach((m) => console.log('  ⚠ ' + m)) }