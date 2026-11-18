'use strict'
/* 彻底去掉浏览器下载兜底：只走 save=1，失败就提示，绝不弹窗 */
const fs = require('node:fs')
const p = 'public/app.js'
let s = fs.readFileSync(p, 'utf8')

/* 找到浏览器下载那段（a.href = '/api/download?...'）并整块替换成错误提示 */
const oldBlock = `    const a = document.createElement('a')
    a.href = '/api/download?' + p.toString()
    a.download = ''
    document.body.appendChild(a)
    a.click()
    setTimeout(() => a.remove(), 1500)
    state.downloads.unshift({ name: song.name, singer: song.singer, quality: state.quality, ts: Date.now() })
    state.downloads = state.downloads.slice(0, 30)
    LS.set('lx.downloads', state.downloads)`

const newBlock = `    /* 直存都失败：只提示，不再用浏览器下载（避免弹另存为） */
    toast('下载失败：目录不可写，请在设置里换个位置（如 D:\\\\Music）', 4200)`

if (s.includes(oldBlock)) {
  s = s.replace(oldBlock, newBlock)
  fs.writeFileSync(p, s, 'utf8')
  console.log('浏览器下载兜底已移除')
} else {
  console.log('未匹配，尝试宽松匹配')
  const idx = s.indexOf("a.href = '/api/download?' + p.toString()")
  if (idx > 0) {
    const start = s.lastIndexOf('  try {', idx)
    /* 找到这个 try 块的结束 */
    let depth = 0
    let end = start
    let started = false
    for (let i = start; i < s.length; i++) {
      if (s[i] === '{') { depth++; started = true } else if (s[i] === '}') { depth--; if (started && depth === 0) { end = i + 1; break } }
    }
    s = s.slice(0, start) + `  toast('下载失败：目录不可写，请在设置里换个位置', 4200)` + s.slice(end)
    fs.writeFileSync(p, s, 'utf8')
    console.log('已用宽松方式移除')
  }
}
console.log('残留 a.href download:', (s.match(/a\.href = '\\/api\\/download/g) || []).length)
