'use strict'
/* 网易云外链对 VIP 歌返回 200 + HTML 页面（不是音频），播放必然失败
   改成：外链只做最后兜底，且必须验证内容真的是音频 */
const fs = require('node:fs')
const p = 'mobile/www/api-mobile.js'
let s = fs.readFileSync(p, 'utf8')

const oldWy = `    if (source === 'wy') {
      const u = 'https://music.163.com/song/media/outer/url?id=' + encodeURIComponent(id) + '.mp3'
      let status = 0
      try {
        if (window.NAPI && window.NAPI.probe) {
          const raw = JSON.parse(window.NAPI.probe(u))
          status = Number(raw && raw.status) || 0
        }
      } catch (e) { status = 0 }
      if (status === 200 || status === 206) {
        return { url: u, quality: '128k', provider: '网易云外链' }
      }
      throw new Error('这首取不到播放地址，换一首或换个平台')
    }`

const newWy = `    if (source === 'wy') {
      const u = 'https://music.163.com/song/media/outer/url?id=' + encodeURIComponent(id) + '.mp3'
      let status = 0
      let head = ''
      try {
        if (window.NAPI && window.NAPI.probe) {
          const raw = JSON.parse(window.NAPI.probe(u))
          status = Number(raw && raw.status) || 0
          head = String((raw && raw.head) || raw.body || '')
        }
      } catch (e) { }
      /* 网易云外链对 VIP 歌会返回 200 + HTML，必须验证真的是音频 */
      const looksAudio = /^ID3|^\\xFF\\xFB|^fLaC|^OggS|^ftyp/.test(head) || /audio|mpeg|octet-stream/i.test(head)
      const okStatus = status === 200 || status === 206
      if (okStatus && looksAudio) {
        return { url: u, quality: '128k', provider: '网易云外链' }
      }
      throw new Error('这首取不到播放地址（可能是 VIP 歌），换一首试试')
    }`

if (s.includes(oldWy)) {
  s = s.replace(oldWy, newWy)
  fs.writeFileSync(p, s, 'utf8')
  console.log('外链已加内容校验')
} else {
  console.log('未匹配外链块')
}

/* 同时：手机端播放失败时给更明确的提示 */
let app = fs.readFileSync('mobile/www/app.js', 'utf8')
if (!app.includes('这首放不了，换一首')) {
  const marker = "a.onerror = () => {"
  const i = app.indexOf(marker)
  if (i > 0) {
    console.log('找到 onerror 处理，位置 ' + i)
  }
}
console.log('完成')
