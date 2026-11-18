'use strict'
/* 补回下载格式按钮绑定（之前误删） */
const fs = require('node:fs')
const p = 'public/app.js'
let s = fs.readFileSync(p, 'utf8')

if (!s.includes(".dl-fmt')).forEach((b)")) {
  const anchor = "  $$('.mode-btn').forEach((b) => {"
  const block = `  $$('.dl-fmt').forEach((b) => {
    b.classList.toggle('active', b.dataset.fmt === state.dlFormat)
    b.onclick = () => {
      state.dlFormat = b.dataset.fmt
      $$('.dl-fmt').forEach((x) => x.classList.toggle('active', x === b))
      saveSettings()
      toast('下载格式：' + (state.dlFormat === 'flac' ? 'FLAC 无损' : 'MP3 320K'), 1600)
    }
  })
`
  const i = s.lastIndexOf(anchor)
  if (i > 0) {
    s = s.slice(0, i) + block + s.slice(i)
    fs.writeFileSync(p, s, 'utf8')
  }
}

console.log('dl-fmt 绑定:', (s.match(/dl-fmt'\\)\\.forEach\\(\\(b\\)/g) || []).length)
console.log('含绑定代码:', s.includes(".dl-fmt')).forEach((b)")
