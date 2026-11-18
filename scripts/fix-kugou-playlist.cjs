'use strict'
/* 用实测可用的 mobilecdn 接口重写手机端酷狗歌单分支 */
const fs = require('node:fs')
const p = 'mobile/www/api-mobile.js'
let s = fs.readFileSync(p, 'utf8')

/* 定位现有 kg 分支 */
const start = s.indexOf("    if (platform === 'kg') {")
if (start < 0) { console.log('未找到 kg 分支'); process.exit(1) }

/* 找到分支结束（匹配花括号） */
let depth = 0
let started = false
let end = start
for (let i = start; i < s.length; i++) {
  if (s[i] === '{') { depth++; started = true } else if (s[i] === '}') { depth--; if (started && depth === 0) { end = i + 1; break } }
}

const NEW_KG = `    if (platform === 'kg') {
      /* 酷狗歌单：实测 mobilecdn 的两个接口可用（需要 insecure 跳过证书校验） */
      const kgHeaders = {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36',
        Referer: 'https://m.kugou.com/',
        Accept: 'application/json, text/plain, */*',
      }

      let plName = '酷狗歌单'
      try {
        const ri = await nativeHttp('https://mobilecdn.kugou.com/api/v3/special/info?specialid=' + id + '&format=json', {
          headers: kgHeaders,
          insecure: true,
        })
        let ji = null
        try { ji = JSON.parse(ri.body) } catch (e) { }
        if (ji && ji.data && ji.data.specialname) plName = ji.data.specialname
      } catch (e) { }

      let songs = []
      /* 分页拉，最多 5 页 */
      for (let page = 1; page <= 5; page++) {
        let arr = []
        try {
          const r = await nativeHttp('https://mobilecdn.kugou.com/api/v3/special/song?specialid=' + id + '&page=' + page + '&pagesize=100&format=json', {
            headers: kgHeaders,
            insecure: true,
          })
          let j = null
          try { j = JSON.parse(r.body) } catch (e) { }
          arr = (j && j.data && j.data.info) || []
        } catch (e) { break }
        if (!arr.length) break
        for (const t of arr) {
          const fn = String(t.filename || '')
          const parts = fn.split(' - ')
          const songName = (t.songname || parts[1] || fn).replace(/\\.(mp3|flac|m4a)$/i, '').trim()
          const hash = String(t.hash || '')
          if (!hash || !songName) continue
          songs.push({
            id: hash,
            source: 'kg',
            name: songName,
            singer: (t.singername || parts[0] || '').trim(),
            album: t.remark || '',
            durationText: msToText(Number(t.duration || 0) * 1000),
            cover: '',
            /* 酷狗取流需要 album_id */
            albumId: t.album_id ? String(t.album_id) : '',
          })
        }
        const total = arr.length
        if (total < 100) break
      }

      if (!songs.length) throw new Error('酷狗歌单读取失败（可能不是公开歌单）')
      return { platform, name: plName, songs, skipped: 0 }
    }`

s = s.slice(0, start) + NEW_KG + s.slice(end)
fs.writeFileSync(p, s, 'utf8')
console.log('酷狗歌单分支已重写（用 mobilecdn 接口）')
