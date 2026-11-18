/* 由 scripts/build-mobile-www.js 生成 · 音乐接口层（浏览器/Node 通用）
 * 依赖全局 __REQ__(url, opts, cb) 提供 HTTP 请求
 */
(function () {
  const __REQ__ = (typeof globalThis.__REQ__ === 'function')
    ? globalThis.__REQ__
    : function (url, opts, cb) { cb(new Error('未注入 __REQ__')) }

;(function () {
const __REQ__ = globalThis.__REQ__
/*
 * 网易云音乐官方接口（搜索 / 详情 / 歌词 / 封面）
 * 说明：搜索走 /api/cloudsearch/pc（返回结构化的 ar/al/dt 字段），
 *      歌词走 /api/song/lyric，详情走 /api/song/detail。
 *      本模块只负责元数据；播放地址由自定义音源脚本提供（见 source-manager）。
 */
const request = function (u, o, c) { return globalThis.__REQ__(u, o, c) }
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const HEADERS = {
  'User-Agent': UA,
  Referer: 'https://music.163.com/',
  Cookie: 'appver=2.0.2; os=pc; NMTID=00O0',
  Accept: '*/*',
}

const cache = new Map()
function cached (key, ttl, fn) {
  const hit = cache.get(key)
  if (hit && hit.exp > Date.now()) return hit.value
  const p = fn()
  cache.set(key, { value: p, exp: Date.now() + ttl })
  if (cache.size > 300) cache.delete(cache.keys().next().value)
  return p
}

const apiCache = new Map()
function api (path, timeout = 15000) {
  const url = path.startsWith('http') ? path : 'https://music.163.com' + path
  const hit = apiCache.get(url)
  if (hit && hit.exp > Date.now()) return Promise.resolve(hit.value)
  return new Promise((resolve, reject) => {
    request(url, { headers: HEADERS, timeout }, (err, resp) => {
      if (err) return reject(new Error('网易云接口请求失败: ' + err.message))
      let body = resp.body
      if (typeof body === 'string') {
        try { body = JSON.parse(body) } catch (e) { return reject(new Error('网易云接口返回非 JSON')) }
      }
      if (resp.statusCode >= 400) return reject(new Error('网易云接口状态码 ' + resp.statusCode))
      if (body && (body.code === 200 || body.songs || body.result || body.lrc)) {
        apiCache.set(url, { value: body, exp: Date.now() + 10 * 60e3 })
        if (apiCache.size > 200) apiCache.delete(apiCache.keys().next().value)
      }
      resolve(body)
    })
  })
}

function fmtDuration (ms) {
  if (!ms) return ''
  const s = Math.floor(ms / 1000)
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0')
}

function mapSong (s) {
  const ar = s.ar || s.artists || []
  const al = s.al || s.album || {}
  const picStr = al.pic_str || al.pic || (al.picUrl ? extractPicId(al.picUrl) : '')
  return {
    id: String(s.id),
    urlId: String(s.id),
    lyricId: String(s.id),
    picId: picStr ? String(picStr) : '',
    name: s.name || '未知歌曲',
    singer: ar.map((a) => a.name).join(' / ') || '未知歌手',
    album: al.name || '',
    albumId: al.id ? String(al.id) : '',
    cover: al.picUrl || '',
    duration: s.dt || s.duration || 0,
    durationText: fmtDuration(s.dt || s.duration),
    fee: s.fee,
    source: 'wy',
    raw: {
      songmid: String(s.id),
      id: String(s.id),
      name: s.name,
      singer: ar.map((a) => a.name).join('、'),
      albumName: al.name || '',
      albumId: picStr ? String(picStr) : '',
      interval: fmtDuration(s.dt || s.duration),
      _types: { wy: true },
      source: 'wy',
    },
  }
}

/* 从封面 URL 里提取歌曲图片 id：.../<picId>.jpg */
function extractPicId (url) {
  const m = /([0-9a-zA-Z]+)\.[a-z]+(\?|$)/.exec(url || '')
  return m ? m[1] : ''
}

async function search (keyword, page = 1, limit = 30) {
  const offset = (page - 1) * limit
  const body = await api('/api/cloudsearch/pc?s=' + encodeURIComponent(keyword) + '&type=1&offset=' + offset + '&limit=' + limit)
  const songs = body && body.result && body.result.songs
  if (!Array.isArray(songs)) throw new Error('未搜索到歌曲')
  return {
    total: body.result.songCount || songs.length,
    list: songs.map(mapSong),
  }
}

async function detail (id) {
  const body = await api('/api/song/detail/?ids=[' + id + ']')
  const s = body && body.songs && body.songs[0]
  if (!s) throw new Error('歌曲详情为空')
  return {
    id: String(s.id),
    name: s.name,
    singer: (s.artists || []).map((a) => a.name).join(' / '),
    album: s.album && s.album.name,
    cover: (s.album && s.album.picUrl) || '',
    duration: s.duration || 0,
    durationText: fmtDuration(s.duration),
  }
}

async function lyric (id) {
  const body = await api('/api/song/lyric?id=' + id + '&lv=1&kv=1&tv=1')
  return {
    lyric: (body && body.lrc && body.lrc.lyric) || '',
    tlyric: (body && body.tlyric && body.tlyric.lyric) || '',
  }
}

async function pic (id) {
  const d = await detail(id)
  return d.cover || ''
}

/* 榜单：热歌榜 3778678 / 新歌榜 3779629 / 飙升榜 19723756 / 原创榜 2884035 */
const TOPLISTS = {
  hot: { id: '3778678', name: '热歌榜' },
  new: { id: '3779629', name: '新歌榜' },
  soar: { id: '19723756', name: '飙升榜' },
  original: { id: '2884035', name: '原创榜' },
}

async function toplist (type = 'hot') {
  const t = TOPLISTS[type] || TOPLISTS.hot
  const d = await api('/api/v6/playlist/detail?id=' + t.id + '&n=100')
  const pl = (d && d.playlist) || {}
  let ids = (pl.trackIds || []).map((x) => x.id)
  if (!ids.length && Array.isArray(pl.tracks)) return { name: pl.name || t.name, id: t.id, list: pl.tracks.map(mapSong) }
  ids = ids.slice(0, 50)
  if (!ids.length) return { name: pl.name || t.name, id: t.id, list: [] }
  const s = await api('/api/song/detail/?ids=[' + ids.join(',') + ']')
  const byId = new Map((s.songs || []).map((x) => [String(x.id), x]))
  const list = ids.map((id) => byId.get(String(id))).filter(Boolean).map(mapSong)
  return { name: pl.name || t.name, id: t.id, list }
}

/* 推荐歌单（分页：歌单广场热门） */
async function recommendPlaylists (offset = 0, limit = 30) {
  const body = await api('/api/playlist/list?cat=' + encodeURIComponent('全部') + '&order=hot&limit=' + limit + '&offset=' + offset)
  const list = (body && body.playlists) || []
  return list.map((x) => ({
    id: String(x.id),
    name: x.name,
    cover: x.coverImgUrl || x.picUrl || '',
    playCount: x.playCount || 0,
    count: x.trackCount || 0,
    platform: 'wy',
  }))
}

/* 新歌速递 */
async function newSongs (limit = 10) {
  const body = await api('/api/personalized/newsong?limit=' + limit)
  const list = (body && body.result) || []
  return list.map((x) => x.song).filter(Boolean).map(mapSong)
}

globalThis.NET_WY = { search, detail, lyric, pic, mapSong, fmtDuration, api, toplist, TOPLISTS, recommendPlaylists, newSongs, HEADERS }
})();

;(function () {
const __REQ__ = globalThis.__REQ__
/*
 * QQ 音乐搜索 / 详情 / 歌词 / 封面
 * 接口：c.y.qq.com/soso/fcgi-bin/search_for_qq_cp（老版搜索，无需登录）
 *      c.y.qq.com/v8/fcg-bin/fcg_play_single_song.fcg（单曲详情）
 *      c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg（歌词）
 */
const request = function (u, o, c) { return globalThis.__REQ__(u, o, c) }
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
let QQ_COOKIE = ''
let QQ_UIN = ''

/** 设置登录后的 Cookie（从 my.y.qq.com 复制），用于访问需要登录的接口 */
function setCookie (cookie, uin) {
  QQ_COOKIE = String(cookie || '').trim()
  QQ_UIN = String(uin || '').trim()
  if (!QQ_UIN && QQ_COOKIE) {
    const m = /(?:^|;\s*)uin=(\d+)/.exec(QQ_COOKIE)
    if (m) QQ_UIN = m[1]
  }
}
function currentCookie () {
  return QQ_COOKIE ? (QQ_COOKIE + (QQ_COOKIE.endsWith(';') ? '' : ';') + ' uin=' + (QQ_UIN || '0')) : 'uin=0; pgv_pvi=1234567890'
}
function currentUin () { return QQ_UIN || '0' }

const HEADERS = {
  'User-Agent': UA,
  Referer: 'https://y.qq.com/',
  Cookie: 'uin=0; pgv_pvi=1234567890',
  Accept: '*/*',
}

const cache = new Map()
function cached (key, ttl, fn) {
  const hit = cache.get(key)
  if (hit && hit.exp > Date.now()) return hit.value
  const p = fn()
  cache.set(key, { value: p, exp: Date.now() + ttl })
  if (cache.size > 200) cache.delete(cache.keys().next().value)
  return p
}

function api (url, timeout = 15000) {
  return new Promise((resolve, reject) => {
    request(url, { headers: HEADERS, timeout }, (err, resp) => {
      if (err) return reject(new Error('QQ 音乐接口失败: ' + err.message))
      let body = resp.body
      if (typeof body === 'string') {
        try { body = JSON.parse(body) } catch (e) { return reject(new Error('QQ 音乐返回非 JSON')) }
      }
      if (resp.statusCode >= 400) return reject(new Error('QQ 音乐状态码 ' + resp.statusCode))
      resolve(body)
    })
  })
}

const fmtTime = (sec) => {
  const s = Number(sec) || 0
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0')
}

function mapSong (s) {
  const singer = (s.singer || []).map((x) => x.name).join(' / ')
  const mid = s.songmid || s.mid
  const interval = s.interval || 0
  const albumMid = s.albummid || (s.album && s.album.mid) || ''
  const mediaMid = s.media_mid || s.strMediaMid || (s.file && s.file.media_mid) || mid
  return {
    id: String(mid),
    urlId: String(mid),
    lyricId: String(mid),
    picId: String(albumMid),
    name: s.songname || s.name || s.title || '未知歌曲',
    singer: singer || '未知歌手',
    album: s.albumname || (s.album && s.album.name) || '',
    albumId: String(s.albumid || (s.album && s.album.id) || ''),
    cover: albumMid ? 'https://y.gtimg.cn/music/photo_new/T002R300x300M000' + albumMid + '.jpg' : '',
    duration: interval * 1000,
    durationText: fmtTime(interval),
    fee: s.pay && s.pay.payplay ? 1 : 0,
    source: 'tx',
    mediaMid,
    raw: {
      songmid: String(mid),
      songId: s.songid || s.id || 0,
      strMediaMid: mediaMid,
      media_mid: mediaMid,
      name: s.songname || s.name || '',
      singer: (s.singer || []).map((x) => x.name).join('、'),
      albumName: s.albumname || (s.album && s.album.name) || '',
      albumMid,
      interval: fmtTime(interval),
      _types: { tx: true },
      source: 'tx',
    },
  }
}

async function search (keyword, page = 1, limit = 30) {
  return cached('qq:search:' + keyword + ':' + page + ':' + limit, 5 * 60e3, async () => {
    const url = 'https://c.y.qq.com/soso/fcgi-bin/search_for_qq_cp?w=' + encodeURIComponent(keyword) +
      '&p=' + page + '&n=' + limit + '&format=json&platform=yqq&needNewCode=0&catZhida=1&remoteplace=txt.yqq.song'
    const body = await api(url)
    const song = body && body.data && body.data.song
    const list = (song && song.list) || []
    if (!list.length) throw new Error('QQ 音乐未搜索到结果（接口可能临时限流，请稍后重试）')
    return { total: song.totalnum || list.length, list: list.map(mapSong) }
  })
}

async function detail (mid) {
  return cached('qq:detail:' + mid, 10 * 60e3, async () => {
    const body = await api('https://c.y.qq.com/v8/fcg-bin/fcg_play_single_song.fcg?songmid=' + mid + '&platform=yqq&format=json&inCharset=utf8&outCharset=utf-8')
    const s = body && body.data && body.data[0]
    if (!s) throw new Error('QQ 歌曲详情为空')
    return mapSong(s)
  })
}

async function lyric (mid) {
  try {
    const body = await api('https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=' + mid + '&format=json&nobase64=1&g_tk=5381&loginUin=0&hostUin=0&platform=yqq&needNewCode=0')
    return { lyric: (body && body.lyric) || '', tlyric: (body && body.trans) || '' }
  } catch (e) {
    return { lyric: '', tlyric: '' }
  }
}

async function pic (song) {
  if (song && song.cover) return song.cover
  if (song && song.picId) return 'https://y.gtimg.cn/music/photo_new/T002R300x300M000' + song.picId + '.jpg'
  return ''
}

/* 榜单：26 热歌 / 27 新歌 / 4 飙升 / 62 经典 */
const TOPLISTS = {
  hot: { id: '26', name: 'QQ音乐热歌榜' },
  new: { id: '27', name: 'QQ音乐新歌榜' },
  soar: { id: '4', name: 'QQ音乐飙升榜' },
  original: { id: '62', name: 'QQ音乐经典榜' },
}

async function toplist (type = 'hot') {
  const t = TOPLISTS[type] || TOPLISTS.hot
  return cached('qq:top:' + t.id, 10 * 60e3, async () => {
    const body = await api('https://c.y.qq.com/v8/fcg-bin/fcg_v8_toplist_cp.fcg?topid=' + t.id +
      '&page=detail&type=top&song_begin=0&song_num=50&format=json&platform=yqq')
    const list = ((body && body.songlist) || []).map((x) => x.data).filter(Boolean).map(mapSong)
    return { name: t.name, id: t.id, list }
  })
}

/* 推荐歌单（分页：歌单广场） */
async function recommendPlaylists (offset = 0, limit = 30) {
  const ein = offset + limit - 1
  const url = 'https://c.y.qq.com/splcloud/fcgi-bin/fcg_get_diss_by_tag.fcg?picmid=1&rnd=0.1&g_tk=5381' +
    '&format=json&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq.json&hostUin=0' +
    '&sin=' + offset + '&ein=' + ein + '&sortId=5&needNewCode=0&categoryId=10000000'
  const body = await api(url)
  const list = (body && body.data && body.data.list) || []
  return list.map((x) => ({
    id: String(x.dissid),
    name: x.dissname,
    cover: x.imgurl || '',
    playCount: x.listennum || 0,
    count: x.song_count || 0,
    platform: 'tx',
  }))
}

globalThis.NET_TX = { search, detail, lyric, pic, toplist, mapSong, HEADERS, recommendPlaylists }
})();

;(function () {
const __REQ__ = globalThis.__REQ__
/*
 * 酷狗音乐搜索 / 歌词 / 封面
 * 接口：mobilecdn.kugou.com/api/v3/search/song（公开，无需签名；https 证书异常时用 insecure）
 *      krcs.kugou.com/search + lyrics.kugou.com/download（歌词）
 */
const request = function (u, o, c) { return globalThis.__REQ__(u, o, c) }
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const HEADERS = { 'User-Agent': UA, Referer: 'https://www.kugou.com/', Accept: '*/*' }

const cache = new Map()
function cached (key, ttl, fn) {
  const hit = cache.get(key)
  if (hit && hit.exp > Date.now()) return hit.value
  const p = fn()
  cache.set(key, { value: p, exp: Date.now() + ttl })
  if (cache.size > 200) cache.delete(cache.keys().next().value)
  return p
}

function api (url, insecure = true, timeout = 15000) {
  return new Promise((resolve, reject) => {
    request(url, { headers: HEADERS, insecure, timeout }, (err, resp) => {
      if (err) return reject(new Error('酷狗接口失败: ' + err.message))
      let body = resp.body
      if (typeof body === 'string') {
        try { body = JSON.parse(body) } catch (e) { return reject(new Error('酷狗返回非 JSON')) }
      }
      if (resp.statusCode >= 400) return reject(new Error('酷狗状态码 ' + resp.statusCode))
      resolve(body)
    })
  })
}

const fmtTime = (sec) => {
  const s = Number(sec) || 0
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0')
}

function coverOf (s) {
  const t = s.trans_param || {}
  const uri = t.union_cover || t.union_cover_od || ''
  if (!uri) return ''
  return String(uri).replace('{size}', '300')
}

function mapSong (s) {
  const hash = s.hash || s.FileHash || ''
  return {
    id: String(hash),
    urlId: String(hash),
    lyricId: String(hash),
    picId: '',
    name: s.songname || s.SongName || s.filename || '未知歌曲',
    singer: s.singername || s.SingerName || '未知歌手',
    album: s.album_name || s.AlbumName || '',
    albumId: String(s.album_id || s.AlbumID || ''),
    cover: coverOf(s),
    duration: (Number(s.duration) || 0) * 1000,
    durationText: fmtTime(s.duration),
    fee: (s.feetype || s.pay_type) ? 1 : 0,
    source: 'kg',
    raw: {
      hash,
      songmid: hash,
      hash320: s['320hash'] || '',
      sqhash: s.sqhash || '',
      audioId: s.audio_id || 0,
      albumAudioId: s.album_audio_id || 0,
      name: s.songname || '',
      singer: s.singername || '',
      albumName: s.album_name || '',
      albumId: String(s.album_id || ''),
      interval: fmtTime(s.duration),
      _types: { kg: true },
      source: 'kg',
    },
  }
}

async function search (keyword, page = 1, limit = 30) {
  return cached('kg:search:' + keyword + ':' + page + ':' + limit, 5 * 60e3, async () => {
    const url = 'https://mobilecdn.kugou.com/api/v3/search/song?format=json&keyword=' + encodeURIComponent(keyword) +
      '&page=' + page + '&pagesize=' + limit + '&showtype=1'
    const body = await api(url)
    const data = body && body.data
    const list = (data && data.info) || []
    if (!list.length) throw new Error('酷狗音乐未搜索到结果')
    return { total: data.total || list.length, list: list.map(mapSong) }
  })
}

/* 酷狗歌词：先查候选，再下载 lrc（base64） */
async function lyric (hash, duration) {
  return cached('kg:lyric:' + hash, 30 * 60e3, async () => {
    try {
      const q = await api('https://krcs.kugou.com/search?ver=1&man=yes&client=mobi&keyword=&duration=' + (duration || '') + '&hash=' + hash)
      const cand = (q && q.candidates && q.candidates[0]) || null
      if (!cand) return { lyric: '', tlyric: '' }
      const d = await api('https://lyrics.kugou.com/download?ver=1&client=pc&id=' + cand.id + '&accesskey=' + cand.accesskey + '&fmt=lrc&charset=utf8')
      const content = d && d.content ? Buffer.from(d.content, 'base64').toString('utf8') : ''
      return { lyric: content, tlyric: '' }
    } catch (e) {
      return { lyric: '', tlyric: '' }
    }
  })
}

async function pic (song) {
  return (song && song.cover) || ''
}

/* 榜单：8888 TOP500 / 74534 新歌 / 6666 飙升 / 31308 内地（热歌） */
const RANKS = {
  top500: { id: '8888', name: '酷狗TOP500' },
  new: { id: '74534', name: '酷狗新歌榜' },
  soar: { id: '6666', name: '酷狗飙升榜' },
  hot: { id: '31308', name: '酷狗内地榜' },
}

async function toplist (type = 'hot') {
  const r = RANKS[type] || RANKS.hot
  return cached('kg:top:' + r.id, 10 * 60e3, async () => {
    const body = await api('https://mobilecdn.kugou.com/api/v3/rank/song?rankid=' + r.id + '&page=1&pagesize=60&format=json')
    const info = (body && body.data && body.data.info) || []
    const list = info.map((x) => mapSong({
      songname: x.songname,
      singername: (x.authors || []).map((a) => a.author_name).join('、'),
      hash: x.hash,
      album_id: x.album_id,
      duration: x.duration,
      trans_param: x.trans_param,
      feetype: x.feetype,
    }))
    return { name: r.name, id: r.id, list }
  })
}

/* 歌单广场（分页） */
async function recommendPlaylists (offset = 0, limit = 30) {
  const page = Math.floor(offset / Math.max(1, limit)) + 1
  const body = await api('https://m.kugou.com/plist/index?json=true&page=' + page)
  const info = (body && body.plist && body.plist.list && body.plist.list.info) || []
  return info.slice(0, limit).map((x) => ({
    id: String(x.specialid),
    name: x.specialname || '酷狗歌单',
    cover: x.imgurl ? String(x.imgurl).replace('{size}', '400') : '',
    playCount: x.playcount || 0,
    count: x.songcount || 0,
    platform: 'kg',
  }))
}

globalThis.NET_KG = { search, lyric, pic, toplist, mapSong, HEADERS, RANKS, recommendPlaylists }
})();

;(function () {
const __REQ__ = globalThis.__REQ__
/*
 * 歌单导入：识别链接 -> 拉取歌单 -> 统一成 songRow 结构
 * 支持：网易云 / QQ 音乐 / 酷狗
 */
const netease = globalThis.NET_WY
const qq = globalThis.NET_TX
const kugou = globalThis.NET_KG

function detect (input) {
  const s = String(input || '').trim()
  if (!s) return null
  if (/^\d{4,}$/.test(s)) return { platform: 'wy', id: s }
  if (/music\.163\.com/.test(s)) {
    const m = /[?&#]id=(\d+)/.exec(s)
    return m ? { platform: 'wy', id: m[1] } : null
  }
  if (/y\.qq\.com|qq\.com\/n\/ryqq/.test(s)) {
    const m = /playlist\/(\d+)/.exec(s) || /disstid=(\d+)/.exec(s) || /[?&]id=(\d+)/.exec(s)
    return m ? { platform: 'tx', id: m[1] } : null
  }
  if (/kugou\.com/.test(s)) {
    const m = /single\/(\d+)/.exec(s) || /specialid=(\d+)/.exec(s) || /plist\/list\/(\d+)/.exec(s)
    return m ? { platform: 'kg', id: m[1] } : null
  }
  return null
}

async function fromNetease (id) {
  const d = await netease.api('/api/v6/playlist/detail?id=' + id + '&n=500')
  const pl = d && d.playlist
  if (!pl) throw new Error('网易云歌单不存在或不可访问')
  const ids = (pl.trackIds || []).map((x) => x.id).slice(0, 300)
  const songs = []
  const missing = []
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100)
    const s = await netease.api('/api/song/detail/?ids=[' + chunk.join(',') + ']')
    const byId = new Map((s.songs || []).map((x) => [String(x.id), x]))
    for (const cid of chunk) {
      const song = byId.get(String(cid))
      /* 查不到 / 已下架（st<0）/ 无歌名 → 记为缺失，前端会提示跳过数量 */
      if (!song || (song.st !== undefined && song.st < 0) || !song.name) { missing.push(cid); continue }
      songs.push(netease.mapSong(song))
    }
  }
  return {
    platform: 'wy',
    name: pl.name,
    cover: pl.coverImgUrl || '',
    songs,
    skipped: missing.length,
    skippedIds: missing.slice(0, 30),
  }
}

async function fromQQ (disstid) {
  const url = 'https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0' +
    '&disstid=' + disstid + '&format=json&g_tk=5381&loginUin=' + qq.currentUin() + '&hostUin=0&inCharset=utf8&outCharset=utf-8' +
    '&notice=0&platform=yqq.json&needNewCode=0'
  const body = await new Promise((resolve, reject) => {
    const request = function (u, o, c) { return globalThis.__REQ__(u, o, c) }
request(url, { headers: Object.assign({}, qq.HEADERS, { Cookie: qq.currentCookie() }), timeout: 20000 }, (err, resp) => {
      if (err) return reject(new Error('QQ 歌单接口失败: ' + err.message))
      let b = resp.body
      if (typeof b === 'string') { try { b = JSON.parse(b) } catch (e) {} }
      resolve(b)
    })
  })
  const cd = body && body.cdlist && body.cdlist[0]
  if (!cd) throw new Error('QQ 歌单需要登录才能读取：请到「设置 → QQ 音乐 Cookie」粘贴浏览器里的 Cookie 后重试')
  const list = (cd.songlist || []).slice(0, 300).map((s) => qq.mapSong({
    songmid: s.songmid,
    songid: s.songid,
    songname: s.songname,
    interval: s.interval,
    albummid: s.albummid,
    albumname: s.albumname,
    albumid: s.albumid,
    singer: s.singer,
    pay: s.pay,
  }))
  return { platform: 'tx', name: cd.dissname || 'QQ 歌单', cover: cd.logo || '', songs: list }
}

async function fromKugou (specialid) {
  const api = globalThis.NET_KG
  const request = function (u, o, c) { return globalThis.__REQ__(u, o, c) }
let name = '酷狗歌单'
  // 1) 移动端 info 接口
  try {
    const info = await new Promise((resolve) => {
      request('https://mobilecdn.kugou.com/api/v3/special/info?specialid=' + specialid + '&format=json',
        { headers: api.HEADERS, insecure: true, timeout: 12000 }, (e, r) => resolve(e ? null : r.body))
    })
    if (info && info.data && info.data.specialname) name = info.data.specialname
  } catch (e) {}
  // 2) 网页标题兜底
  if (name === '酷狗歌单') {
    try {
      const html = await new Promise((resolve) => {
        request('https://www.kugou.com/yy/special/single/' + specialid + '.html',
          { headers: api.HEADERS, insecure: true, timeout: 12000 }, (e, r) => resolve(e ? '' : String(r.body || '')))
      })
      const m = /<title>([^<]{2,80})<\/title>/i.exec(html)
      if (m) name = m[1].replace(/\s*[-_|].*$/, '').trim() || name
    } catch (e) {}
  }
  const body = await new Promise((resolve, reject) => {
    const request = function (u, o, c) { return globalThis.__REQ__(u, o, c) }
request('https://mobilecdn.kugou.com/api/v3/special/song?specialid=' + specialid + '&page=1&pagesize=100&format=json',
      { headers: api.HEADERS, insecure: true, timeout: 20000 }, (err, resp) => {
        if (err) return reject(new Error('酷狗歌单接口失败: ' + err.message))
        resolve(resp.body)
      })
  })
  const info = (body && body.data && body.data.info) || []
  if (!info.length) throw new Error('酷狗歌单为空或不可访问')
  const songs = info.slice(0, 300).map((x) => {
    /* 新接口只给 filename（"歌手 - 歌名"）和 remark，没有 songname/singername */
    const fileName = String(x.filename || '').trim()
    const remark = String(x.remark || '').trim()
    let singer = ''
    let songName = ''
    if (fileName.includes(' - ')) {
      const parts = fileName.split(' - ')
      singer = parts[0].trim()
      songName = parts.slice(1).join(' - ').trim()
    } else {
      songName = remark || fileName
    }
    if (!songName) songName = remark || fileName || '未知歌曲'
    return api.mapSong({
      songname: songName,
      singername: singer || '未知歌手',
      hash: x.hash,
      album_id: x.album_id,
      duration: x.duration,
      trans_param: x.trans_param,
      feetype: x.feetype,
    })
  })
  return { platform: 'kg', name, cover: '', songs }
}

async function importPlaylist (input) {
  const target = detect(input)
  if (!target) throw new Error('无法识别歌单链接，请粘贴歌单页面地址或歌单 ID')
  if (target.platform === 'wy') return await fromNetease(target.id)
  if (target.platform === 'tx') return await fromQQ(target.id)
  return await fromKugou(target.id)
}

globalThis.NET_IMPORT = { detect, importPlaylist }
})();

})()
