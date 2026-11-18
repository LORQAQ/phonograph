'use strict'
/* 手机端酷狗取流改用实测可用的接口：
   http://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash={hash} */
const fs = require('node:fs')
const p = 'mobile/www/api-mobile.js'
let s = fs.readFileSync(p, 'utf8')

const OLD = `    if (source === 'kg') {
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
    }`

const NEW = `    if (source === 'kg') {
      /* play/getdata 要签名（err_code 30020），改用 m.kugou.com 的 getSongInfo（实测可用） */
      const kgHeaders = {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36',
        Referer: 'https://m.kugou.com/',
      }
      let u = ''
      let bitrate = 0

      /* ① getSongInfo（最稳） */
      try {
        const r = await nativeHttp('http://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash=' + encodeURIComponent(id), {
          headers: kgHeaders,
          insecure: true,
        })
        let j = null
        try { j = JSON.parse(r.body) } catch (e) { }
        if (j) {
          u = j.url || j.play_url || (j.backup_url && j.backup_url[0]) || ''
          bitrate = Number(j.bitRate || j.bitrate || 0)
        }
      } catch (e) { }

      /* ② wwwapi 兜底（不需要 album_id） */
      if (!u) {
        try {
          const r2 = await nativeHttp('https://wwwapi.kugou.com/yy/index.php?r=play/getdata&hash=' + encodeURIComponent(id) + '&dfid=1&mid=1&platid=4', {
            headers: Object.assign({ Cookie: 'kg_mid=1; kg_dfid=1' }, kgHeaders),
            insecure: true,
          })
          let j2 = null
          try { j2 = JSON.parse(r2.body) } catch (e) { }
          if (j2 && j2.data) {
            u = j2.data.play_url || j2.data.play_backup_url || ''
            bitrate = Number(j2.data.bitrate || 0)
          }
        } catch (e) { }
      }

      if (!u) throw new Error('酷狗这首取不到地址，换一首或换个平台')
      /* 有些返回带反斜杠转义 */
      u = String(u).replace(/\\\\\\//g, '/')
      return { url: u, quality: bitrate ? Math.round(bitrate / 1000) + 'k' : 'standard', provider: '酷狗直链' }
    }`

if (s.includes(OLD)) {
  s = s.replace(OLD, NEW)
  fs.writeFileSync(p, s, 'utf8')
  console.log('✓ 酷狗取流已改用 getSongInfo')
} else {
  console.log('未匹配，查找当前 kg 分支：')
  const i = s.indexOf("if (source === 'kg')")
  if (i > 0) console.log(s.slice(i, i + 800))
}
