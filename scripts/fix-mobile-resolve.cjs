'use strict'
/* 手机端取流：先走 5 个音源脚本，失败才回落直链
   原来 wy 只试外链、tx 直接报错，导致大量歌放不了 */
const fs = require('node:fs')
const p = 'mobile/www/api-mobile.js'
let s = fs.readFileSync(p, 'utf8')

const startMark = '  async function resolveUrl (id, source, quality) {'
const start = s.indexOf(startMark)
if (start < 0) { console.log('未找到 resolveUrl'); process.exit(1) }

/* 找到函数结束 */
let depth = 0
let started = false
let end = start
for (let i = start; i < s.length; i++) {
  if (s[i] === '{') { depth++; started = true } else if (s[i] === '}') { depth--; if (started && depth === 0) { end = i + 1; break } }
}

const impl = `  async function resolveUrl (id, source, quality) {
    source = source || 'wy'

    /* ① 先走音源脚本（5 个音源都支持 kw/kg/tx/wy/mg） */
    const M = window.LxScriptManager
    if (M && M.scripts && M.scripts.size) {
      try {
        const mi = {
          songmid: id,
          songId: id,
          hash: id,
          name: '',
          singer: '',
          albumName: '',
          interval: '00:00',
          _types: {},
        }
        const hit = await M.resolve(source, mi, quality, '')
        if (hit && hit.url) return hit
      } catch (e) {
        console.warn('[取流] 脚本失败', source, e && e.message)
      }
    }

    /* ② 回落：各平台直链 */
    if (source === 'wy') {
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
    }

    if (source === 'kg') {
      const r = await nativeHttp('https://wwwapi.kugou.com/yy/index.php?r=play/getdata&hash=' + encodeURIComponent(id) + '&dfid=1&mid=1&platid=4&album_id=' + (window.__KG_ALBUM || ''), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
          Referer: 'https://www.kugou.com/',
          Cookie: 'kg_mid=1; kg_dfid=1',
        },
      })
      let j = null
      try { j = JSON.parse(r.body) } catch (e) { j = null }
      const u = j && j.data && j.data.play_url
      if (!u) throw new Error('酷狗这首取不到地址，换一首或换个平台')
      return { url: u, quality: (j.data.bitrate ? Math.round(j.data.bitrate / 1000) + 'k' : 'standard'), provider: '酷狗直链' }
    }

    throw new Error('这首取不到播放地址，换一首或换个平台')
  }`

s = s.slice(0, start) + impl + s.slice(end)
fs.writeFileSync(p, s, 'utf8')
console.log('resolveUrl 已改为：先走音源脚本，失败回落直链')
