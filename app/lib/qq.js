'use strict'
/*
 * QQ 音乐搜索 / 详情 / 歌词 / 封面
 * 接口：c.y.qq.com/soso/fcgi-bin/search_for_qq_cp（老版搜索，无需登录）
 *      c.y.qq.com/v8/fcg-bin/fcg_play_single_song.fcg（单曲详情）
 *      c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg（歌词）
 */
const { request } = require('./lx-engine.js')

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
  const p = Promise.resolve().then(fn)
  cache.set(key, { value: p, exp: Date.now() + ttl })
  /* B16: 失败（rejected）立即清掉，别让一次抖动锁死 5~30 分钟 */
  p.catch(() => { const cur = cache.get(key); if (cur && cur.value === p) cache.delete(key) })
  if (cache.size > 200) cache.delete(cache.keys().next().value)
  return p
}

/* P2: 设置里粘贴的 cookie 之前只被 playlist-import 用到，
   搜索/详情/歌词全都发静态 HEADERS，等于填了也不生效。 */
function headersNow () {
  try {
    const c = currentCookie()
    if (c) return Object.assign({}, HEADERS, { Cookie: c })
  } catch (e) { }
  return HEADERS
}

function api (url, timeout = 15000) {
  return new Promise((resolve, reject) => {
    request(url, { headers: headersNow(), timeout }, (err, resp) => {
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

module.exports = { setCookie, currentCookie, currentUin, search, detail, lyric, pic, toplist, mapSong, HEADERS, recommendPlaylists }
