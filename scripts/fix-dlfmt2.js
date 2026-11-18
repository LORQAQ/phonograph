'use strict'
const fs = require('node:fs')
const p = 'public/app.js'
let s = fs.readFileSync(p, 'utf8')

const D = '$'
const DD = '$$'

const anchor = '  ' + DD + "('.mode-btn').forEach((b) => {"
const block = [
  '  ' + DD + "('.dl-fmt').forEach((b) => {",
  "    b.classList.toggle('active', b.dataset.fmt === state.dlFormat)",
  '    b.onclick = () => {',
  '      state.dlFormat = b.dataset.fmt',
  '      ' + DD + "('.dl-fmt').forEach((x) => x.classList.toggle('active', x === b))",
  '      saveSettings()',
  "      toast('下载格式：' + (state.dlFormat === 'flac' ? 'FLAC 无损' : 'MP3 320K'), 1600)",
  '    }',
  '  })',
].join('\n')

if (!s.includes(".dl-fmt')).forEach((b)")) {
  const i = s.indexOf(anchor)
  if (i > 0) {
    s = s.slice(0, i) + block + '\n' + s.slice(i)
    fs.writeFileSync(p, s, 'utf8')
    console.log('已插入绑定于位置', i)
  } else {
    console.log('未找到插入点')
  }
} else {
  console.log('绑定已存在')
}

const check = fs.readFileSync(p, 'utf8')
console.log('绑定存在:', check.includes(".dl-fmt')).forEach((b)"))
