'use strict'
/*
 * 网易云音乐官方接口（搜索 / 详情 / 歌词 / 封面）
 * 说明：搜索走 /api/cloudsearch/pc（返回结构化的 ar/al/dt 字段），
 *      歌词走 /api/song/lyric，详情走 /api/song/detail。
 *      本模块只负责元数据；播放地址由自定义音源脚本提供（见 source-manager）。
 */
const { request } = require('./lx-engine.js')

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

module.exports = { search, detail, lyric, pic, mapSong, fmtDuration, api, toplist, TOPLISTS, recommendPlaylists, newSongs }
