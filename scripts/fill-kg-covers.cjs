'use strict'
/* 用网易云搜索补酷狗封面（酷狗接口不返回封面字段） */
const fs = require('node:fs')
const p = 'mobile/www/api-mobile.js'
let s = fs.readFileSync(p, 'utf8')

if (s.includes('fillKugouCovers')) {
  console.log('已存在')
  process.exit(0)
}

/* 在 importPlaylistMobile 里，返回前补封面 */
const anchor = "      if (!songs.length) throw new Error('酷狗歌单读取失败（可能不是公开歌单）')\n      return { platform, name: plName, songs, skipped: 0 }"

const neu = `      if (!songs.length) throw new Error('酷狗歌单读取失败（可能不是公开歌单）')

      /* 酷狗接口不返回封面字段，用网易云搜同款补（只补前 30 首，避免太慢） */
      try {
        const need = songs.slice(0, 30).filter((x) => !x.cover)
        await Promise.all(need.map(async (x) => {
          try {
            const kw = encodeURIComponent((x.name + ' ' + x.singer).trim())
            const r = await nativeHttp('https://music.163.com/api/search/get?s=' + kw + '&type=1&limit=1', {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0',
                Referer: 'https://music.163.com/',
              },
            })
            const j = JSON.parse(r.body)
            const hit = j && j.result && j.result.songs && j.result.songs[0]
            if (hit && hit.album && hit.album.picId) {
              const pid = String(hit.album.picId)
              x.cover = 'https://p' + (Number(pid.slice(-1)) % 4 + 1) + '.music.126.net/' + pid + '.jpg'
            }
          } catch (e) { }
        }))
      } catch (e) { }

      return { platform, name: plName, songs, skipped: 0 }`

if (s.includes(anchor)) {
  s = s.replace(anchor, neu)
  fs.writeFileSync(p, s, 'utf8')
  console.log('酷狗封面补全已加（网易云搜同款，前 30 首）')
} else {
  console.log('未匹配锚点')
}
