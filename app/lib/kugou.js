'use strict'
/*
 * 酷狗音乐搜索 / 歌词 / 封面
 * 接口：mobilecdn.kugou.com/api/v3/search/song（公开，无需签名；https 证书异常时用 insecure）
 *      krcs.kugou.com/search + lyrics.kugou.com/download（歌词）
 */
const { request } = require('./lx-engine.js')

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const HEADERS = { 'User-Agent': UA, Referer: 'https://www.kugou.com/', Accept: '*/*' }

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

/* P2: 条目可能是 null */
function mapSong (s) {
  if (!s || typeof s !== 'object') return null
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

module.exports = { search, lyric, pic, toplist, mapSong, HEADERS, RANKS, recommendPlaylists }
