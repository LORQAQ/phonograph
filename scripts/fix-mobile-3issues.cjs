'use strict'
/* 修手机端三个问题：
   1) 酷狗歌单导入（importPlaylistMobile 缺 kg 分支）
   2) 移动端没有返回按钮（CSS 隐藏了 nav-history）
   3) 推荐歌单加载失败时只剩骨架屏 */
const fs = require('node:fs')

const fixed = []

/* ============ 1. 酷狗歌单分支 ============ */
const ap = 'mobile/www/api-mobile.js'
let a = fs.readFileSync(ap, 'utf8')

if (!a.includes("platform === 'kg'") || !a.includes('kugou')) {
  console.log('检查 kg 分支...')
}

/* 在 tx 分支结束后（return { platform, name: cd.dissname...）后面加 kg 分支 */
const txEnd = a.indexOf("return { platform, name: cd.dissname || 'QQ歌单', songs, skipped: 0 }")
if (txEnd > 0) {
  const insertPos = a.indexOf('\n', txEnd) + 1
  const kgBranch = `
    if (platform === 'kg') {
      /* 酷狗歌单：两个接口依次试（新版 / 旧版） */
      let songs = []
      let plName = '酷狗歌单'
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
        Referer: 'https://www.kugou.com/',
        Cookie: 'kg_mid=1; kg_dfid=1',
      }

      /* ① 新版接口 */
      try {
        const r1 = await nativeHttp('https://wwwapi.kugou.com/yy/special/single/' + id + '.json?page=1&pagesize=300&type=0', { headers })
        let j1 = null
        try { j1 = JSON.parse(r1.body) } catch (e) { }
        const data = j1 && (j1.data || j1)
        const arr = (data && (data.songs || data.info || data.list)) || []
        if (arr.length) {
          plName = (data && (data.specialname || data.special_name || data.name)) || plName
          songs = arr.map((t) => {
            const fn = String(t.filename || t.fileName || '')
            const parts = fn.split(' - ')
            return {
              id: String(t.hash || t.FileHash || t.audio_id || t.album_audio_id || ''),
              source: 'kg',
              name: t.songname || t.song_name || t.SongName || (parts[1] || fn).replace(/\\.(mp3|flac|m4a)$/i, ''),
              singer: t.singername || t.singer_name || t.SingerName || parts[0] || '',
              album: t.album_name || t.AlbumName || '',
              durationText: msToText(Number(t.duration || t.Duration || 0) * 1000),
              cover: t.cover || t.img || '',
            }
          }).filter((x) => x.id && x.name)
        }
      } catch (e) { }

      /* ② 旧版接口兜底 */
      if (!songs.length) {
        try {
          const r2 = await nativeHttp('https://m.kugou.com/plist/list/' + id + '?json=true&page=1&pagesize=300', { headers })
          let j2 = null
          try { j2 = JSON.parse(r2.body) } catch (e) { }
          const info = j2 && j2.info
          const arr2 = (info && info.list && info.list.info) || []
          if (arr2.length) {
            plName = (info && info.list && info.list.specialname) || plName
            songs = arr2.map((t) => {
              const fn = String(t.filename || '')
              const parts = fn.split(' - ')
              return {
                id: String(t.hash || ''),
                source: 'kg',
                name: t.songname || (parts[1] || fn).replace(/\\.(mp3|flac|m4a)$/i, ''),
                singer: parts[0] || '',
                album: t.album_name || '',
                durationText: msToText(Number(t.duration || 0) * 1000),
                cover: '',
              }
            }).filter((x) => x.id && x.name)
          }
        } catch (e) { }
      }

      if (!songs.length) throw new Error('酷狗歌单读取失败（可能不是公开歌单）')
      return { platform, name: plName, songs, skipped: 0 }
    }

`
  a = a.slice(0, insertPos) + kgBranch + a.slice(insertPos)
  fs.writeFileSync(ap, a, 'utf8')
  fixed.push('酷狗歌单分支')
} else {
  console.log('未找到 tx 分支结尾')
}

/* ============ 2. 推荐歌单失败提示 ============ */
const appPath = 'mobile/www/app.js'
let app = fs.readFileSync(appPath, 'utf8')

/* loadRecPage 需要看，先找它 */
const li = app.indexOf('function loadRecPage')
if (li > 0) {
  console.log('\n=== loadRecPage ===')
  console.log(app.slice(li, li + 1400))
}

/* ============ 3. 移动端返回按钮（CSS） ============ */
const cp = 'mobile/www/style.css'
let css = fs.readFileSync(cp, 'utf8')

const MARK = '/* ==== 移动端返回栏 ==== */'
if (!css.includes(MARK)) {
  css += `
${MARK}
/* 移动端顶栏显示返回/前进按钮（之前两行布局时被隐藏了） */
@media (max-width: 860px) {
  .nav-history { display: flex !important; gap: 6px; flex-shrink: 0; }
  .nav-history .nav-btn { padding: 6px 8px; }
  .nav-history .nav-btn.home { display: none; }   /* 主页按钮占地方，隐藏 */
  .nav-history .nav-btn:disabled { opacity: .3; }
  .nav-history svg { width: 16px; height: 16px; }
}
`
  fs.writeFileSync(cp, css, 'utf8')
  fixed.push('移动端返回按钮')
}

console.log('\n=== 本轮修复 ===')
fixed.forEach((f) => console.log('  ✓ ' + f))
