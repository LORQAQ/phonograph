'use strict'
/* 1) 去掉重复的 save=1 调用，保留「直存 → 浏览器兜底」两条  */
const fs = require('node:fs')
const p = 'public/app.js'
let s = fs.readFileSync(p, 'utf8')

/* 找到第二段「先让后端直接存盘」块（重复的），整段删掉，只留浏览器兜底 */
const dupMark = `  try {
    const p = songParams(song)
    /* 先让后端直接存盘（不弹另存为） */
    const sp = new URLSearchParams(p.toString())
    sp.set('save', '1')
    try {
      const r = await api('/api/download?' + sp.toString())
      if (r && r.ok) {
        toast('已保存：' + r.name + '（' + (r.size / 1048576).toFixed(1) + ' MB）', 3600)
        state.downloads.unshift({ name: song.name, singer: song.singer, quality: state.quality, ts: Date.now(), path: r.path })
        state.downloads = state.downloads.slice(0, 30)
        LS.set('lx.downloads', state.downloads)
        state.downloading.delete(key)
        try { renderList && renderList() } catch (e) { }
        return
      }
    } catch (e) { /* 直存失败就回落浏览器下载 */ }`

const replMark = `  try {
    const p = songParams(song)
    /* 直存失败 → 用浏览器下载（WebView2 由外壳接管保存位置） */`

if (s.includes(dupMark)) {
  s = s.replace(dupMark, replMark)
  fs.writeFileSync(p, s, 'utf8')
  console.log('重复的 save=1 已移除')
} else {
  console.log('未匹配重复块')
}
console.log('save=1 出现次数:', (s.match(/sp\.set\('save', '1'\)/g) || []).length)
console.log('save 参数次数:', (s.match(/set\('save', '1'\)/g) || []).length)
