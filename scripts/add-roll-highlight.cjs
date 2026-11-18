'use strict'
/* syncLyric 里同步播放页歌词的高亮（原来只更新全屏页） */
const fs = require('node:fs')
const p = 'mobile/www/app.js'
let a = fs.readFileSync(p, 'utf8')

const MARK = '播放页歌词：同步高亮'
if (a.includes(MARK)) {
  console.log('已存在')
  process.exit(0)
}

/* 找 syncLyric 里替换播放页 lyrics 的位置 */
const anchor = '  /* 播放页里的歌词也要跟着滚 */'

if (!a.includes(anchor)) {
  console.log('未找到锚点，列出 syncLyric 内容:')
  const i = a.indexOf('function syncLyric')
  console.log(a.slice(i, i + 1200))
  process.exit(1)
}

const insert = `  /* 播放页歌词：同步高亮 */
  try {
    const roll = $('#lyricRoll')
    if (roll) {
      const lls = roll.querySelectorAll('.ll')
      lls.forEach((el2, i2) => el2.classList.toggle('active', i2 === idx))
    }
  } catch (e) { }
${anchor}`

a = a.replace(anchor, insert)
fs.writeFileSync(p, a, 'utf8')
console.log('高亮同步已插入')
