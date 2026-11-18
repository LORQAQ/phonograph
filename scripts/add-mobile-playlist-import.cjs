'use strict'
/* 手机端歌单导入：现在只支持本地歌单，QQ/网易云/酷狗的导入会报 qq.currentUin 错误
   补一个手机端的 importPlaylist 实现 */
const fs = require('node:fs')
const p = 'mobile/www/api-mobile.js'
let s = fs.readFileSync(p, 'utf8')

if (s.includes('async function importPlaylistMobile')) {
  console.log('已存在，跳过')
  process.exit(0)
}

const impl = `
  /* ---------- 歌单导入（手机端） ---------- */
  function parsePlaylistUrl (raw) {
    const u = String(raw || '').trim()
    if (!u) return null
    /* 网易云 */
    let m = u.match(/music\\.163\\.com[^#]*[#/]playlist\\?[^#]*id=(\\d+)/) || u.match(/[?&]id=(\\d+)/)
    if (/music\\.163\\.com/.test(u) && m) return { platform: 'wy', id: m[1] }
    /* QQ 音乐 */
    m = u.match(/y\\.qq\\.com[^#]*playlist\\/(\\d+)/) || u.match(/playlist\\/(\\d+)/)
    if (/qq\\.com/.test(u) && m) return { platform: 'tx', id: m[1] }
    /* 酷狗 */
    m = u.match(/kugou\\.com[^#]*special\\/single\\/(\\d+)/) || u.match(/special\\/single\\/(\\d+)/)
    if (/kugou\\.com/.test(u) && m) return { platform: 'kg', id: m[1] }
    return null
  }

  async function importPlaylistMobile (url) {
    const hit = parsePlaylistUrl(url)
    if (!hit) throw new Error('无法识别这个歌单链接，支持网易云 / QQ音乐 / 酷狗')
    const { platform, id } = hit

    if (platform === 'wy') {
      const r = await nativeHttp('https://music.163.com/api/v6/playlist/detail?id=' + id + '&n=1000&s=0', {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0', Referer: 'https://music.163.com/' },
      })
      let j = null
      try { j = JSON.parse(r.body) } catch (e) { }
      const pl = j && j.playlist
      if (!pl) throw new Error('网易云歌单读取失败')
      const songs = (pl.tracks || []).map((t) => ({
        id: String(t.id),
        source: 'wy',
        name: t.name,
        singer: (t.ar || []).map((a) => a.name).join(' / ') || (t.artists || []).map((a) => a.name).join(' / '),
        album: (t.al && t.al.name) || (t.album && t.album.name) || '',
        durationText: msToText(t.dt || t.duration || 0),
        cover: (t.al && t.al.picUrl) || (t.album && t.album.picUrl) || '',
      }))
      return { platform, name: pl.name || '网易云歌单', songs, skipped: 0 }
    }

    if (platform === 'tx') {
      /* QQ 歌单：用 u.y.qq.com 的分享接口，不需要登录 */
      const api1 = 'https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0&disstid=' + id + '&format=json&g_tk=5381&loginUin=0&hostUin=0&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=0'
      const r = await nativeHttp(api1, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0', Referer: 'https://y.qq.com/' },
      })
      let j = null
      try { j = JSON.parse(String(r.body).replace(/^callback\\(/, '').replace(/\\)$/, '')) } catch (e) { }
      const cd = j && j.cdlist && j.cdlist[0]
      if (!cd) throw new Error('QQ 歌单读取失败（可能需要公开歌单）')
      const songs = (cd.songlist || []).map((t) => ({
        id: t.songmid,
        source: 'tx',
        name: t.songname,
        singer: (t.singer || []).map((x) => x.name).join(' / '),
        album: (t.albumdesc || (t.album && t.album.name)) || '',
        durationText: msToText(t.interval ? t.interval * 1000 : 0),
        cover: t.albummid ? ('https://y.gtimg.cn/music/photo_new/T002R300x300M000' + t.albummid + '.jpg') : '',
      }))
      return { platform, name: cd.dissname || 'QQ歌单', songs, skipped: 0 }
    }

    /* 酷狗 */
    const kgApi = 'https://wwwapi.kugou.com/yy/special/single/' + id + '.json'
    const r = await nativeHttp(kgApi, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0', Referer: 'https://www.kugou.com/' },
    })
    let j = null
    try { j = JSON.parse(r.body) } catch (e) { }
    const data = j && (j.data || j)
    const arr = (data && (data.songs || data.info)) || []
    const songs = arr.map((t) => {
      const fn = t.filename || ''
      const parts = fn.split(' - ')
      return {
        id: t.hash || t.album_id,
        source: 'kg',
        name: t.songname || (parts[1] || fn),
        singer: t.singername || (parts[0] || ''),
        album: t.album_name || '',
        durationText: msToText((t.duration || 0) * 1000),
        cover: '',
      }
    }).filter((x) => x.id && x.name)
    if (!songs.length) throw new Error('酷狗歌单读取失败')
    return { platform, name: (data && data.specialname) || '酷狗歌单', songs, skipped: 0 }
  }

  function msToText (ms) {
    if (!ms) return ''
    const s2 = Math.round(ms / 1000)
    return Math.floor(s2 / 60) + ':' + String(s2 % 60).padStart(2, '0')
  }
`

/* 插到 resolveUrl 之前 */
const anchor = '  async function resolveUrl (id, source, quality) {'
if (s.includes(anchor)) {
  s = s.replace(anchor, impl + '\n' + anchor)
  console.log('importPlaylistMobile 已插入')
} else {
  console.log('未找到插入点')
}

/* /api/playlist 里加 import / preview 分支 */
const oldRoute = `    if (p === '/api/playlist') {`
const newRoute = `    if (p === '/api/playlist') {
      const action = body.action || q.get('action')
      if (action === 'preview' || action === 'import') {
        const res2 = await importPlaylistMobile(body.url || q.get('url') || '')
        return res2
      }`

if (s.includes(oldRoute)) {
  s = s.replace(oldRoute, newRoute)
  console.log('/api/playlist 已支持 import/preview')
} else {
  console.log('未找到 /api/playlist')
}

fs.writeFileSync(p, s, 'utf8')
console.log('完成')
