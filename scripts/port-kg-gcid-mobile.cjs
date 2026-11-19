'use strict'
/* 把 gcid 全量拉取移植到手机端 api-mobile.js（用 CryptoJS.MD5 + nativeHttp） */
const path = require('node:path')
process.chdir(path.resolve(__dirname, '..'))
const fs = require('node:fs')
const p = 'mobile/www/api-mobile.js'
let s = fs.readFileSync(p, 'utf8')

/* 找旧的 gcid 分支并整体替换 */
const START = '      /* gcid_ 开头的歌单没有公开 API，只能从 songlist 页面的首屏数据里解析 */'
const i = s.indexOf(START)
if (i < 0) {
  console.log('没找到旧 gcid 分支')
  process.exit(0)
}

/* 从 if 块开头找配平的 } */
const ifIdx = s.indexOf("if (/^gcid_/i.test(id)", i)
if (ifIdx < 0) { console.log('没找到 if'); process.exit(1) }
const bodyStart = s.indexOf('{', ifIdx)
let d = 0
let end = bodyStart
for (let k = bodyStart; k < s.length; k++) {
  if (s[k] === '{') d++
  else if (s[k] === '}') { d--; if (d === 0) { end = k + 1; break } }
}
const oldLen = end - i
console.log('旧 gcid 分支 ' + oldLen + ' 字符')

const newBlock = `      /* gcid_ 歌单：照洛雪的路子 —— batch_decode 解码 → info_v2 拿总数 → song_v2 按 300/页翻。
         之前解析 m.kugou.com 的 HTML 只能拿到 SSR 首屏 10 首，?page=2 无效。 */
      if (/^gcid_/i.test(id) || /^[a-z0-9]{14,}$/i.test(id)) {
        const gid = String(id).startsWith('gcid_') ? String(id) : 'gcid_' + id
        const r = await kgGcidPlaylist(gid, 2000)
        return { platform: 'kg', name: r.name || '酷狗歌单', cover: r.cover || '', songs: r.songs }
      }`

s = s.slice(0, i) + newBlock + s.slice(end)

/* 在 mobileApi 之前注入 kgGcidPlaylist 实现 */
const HELPER = `
/* ================= 酷狗 gcid 歌单全量拉取 =================
   照抄洛雪 lx-music-desktop 的思路：
     ① POST t.kugou.com/v1/songlist/batch_decode      gcid → global_collection_id
     ② GET  mobiles.kugou.com/api/v5/special/info_v2  拿 songcount
     ③ GET  mobiles.kugou.com/api/v5/special/song_v2  按 300/页翻（失败退到 get_other_list_file）
   签名：md5(KEY + sort(params.split('&')).join('') + body + KEY)
     WEB_KEY = NVPh5oo715z5DIWAeQlhMDsWXXQV4hwt （appid=1058 / srcappid=2919）
     AND_KEY = OIlwieks28dk2k092lksi2UIkp        （appid=1005）
   POST 的 body 必须原样（无空格）拼进 md5。 */
const __KG_WEB_KEY = 'NVPh5oo715z5DIWAeQlhMDsWXXQV4hwt'
const __KG_AND_KEY = 'OIlwieks28dk2k092lksi2UIkp'
const __KG_UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 11_0 like Mac OS X) AppleWebKit/604.1.38 (KHTML, like Gecko) Version/11.0 Mobile/15A372 Safari/604.1'
const __KG_UA_ANDROID = 'Mozilla/5.0 (Linux; Android 10; HUAWEI HMA-AL00) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.106 Mobile Safari/537.36'

function __kgMd5 (str) {
  try {
    if (window.CryptoJS && window.CryptoJS.MD5) return window.CryptoJS.MD5(str).toString()
  } catch (e) { }
  /* 兜底：极简 md5 不应该走到这里，直接抛 */
  throw new Error('缺少 CryptoJS.MD5，无法签名')
}

function __kgSign (params, platform, body) {
  const key = platform === 'web' ? __KG_WEB_KEY : __KG_AND_KEY
  const sorted = String(params).split('&').sort()
  return __kgMd5(key + sorted.join('') + (body || '') + key)
}

async function __kgReq (url, opt) {
  const o = opt || {}
  const r = await nativeHttp(url, {
    method: o.method || 'GET',
    headers: Object.assign({ 'User-Agent': o.ua || __KG_UA_IPHONE }, o.headers || {}),
    body: o.body,
    insecure: true,
    timeout: 20000,
  })
  let j = null
  try { j = JSON.parse(String(r.body || '')) } catch (e) { }
  return { status: r.statusCode || 0, json: j, raw: r.body }
}

async function __kgDecodeGcid (gcid) {
  const params = 'dfid=-&appid=1005&mid=0&clientver=20109&clienttime=640612895&uuid=-'
  const body = JSON.stringify({ ret_info: 1, data: [{ id: gcid, id_type: 2 }] })
  const sign = __kgSign(params, 'android', body)
  const r = await __kgReq('https://t.kugou.com/v1/songlist/batch_decode?' + params + '&signature=' + sign, {
    method: 'POST', body, ua: __KG_UA_ANDROID, headers: { Referer: 'https://m.kugou.com/' },
  })
  const j = r.json
  if (!j) throw new Error('gcid 解码失败：返回不是 JSON')
  if (j.err_code && j.err_code !== 0) throw new Error('gcid 解码失败：err_code=' + j.err_code)
  const item = j.data && j.data.list && j.data.list[0]
  const gid = item && item.global_collection_id
  if (!gid) throw new Error('gcid 解码失败：拿不到 global_collection_id')
  return gid
}

async function __kgListInfo (globalId) {
  const ct = String(Date.now())
  const params = 'appid=1058&specialid=0&global_specialid=' + encodeURIComponent(globalId) +
    '&format=jsonp&srcappid=2919&clientver=20000&clienttime=' + ct + '&mid=' + ct + '&uuid=' + ct + '&dfid=-'
  const r = await __kgReq('https://mobiles.kugou.com/api/v5/special/info_v2?' + params + '&signature=' + __kgSign(params, 'web'), {
    headers: { mid: ct, clienttime: ct, dfid: '-', Referer: 'https://m3ws.kugou.com/share/index.php' },
  })
  const d = r.json && r.json.data
  if (!d) throw new Error('酷狗歌单信息获取失败')
  return {
    name: d.specialname || d.special_name || '酷狗歌单',
    count: Number(d.songcount || d.song_count || 0),
    cover: d.imgurl || d.img_url || '',
    intro: d.intro || '',
  }
}

async function __kgSongPage (globalId, page, pagesize) {
  const ct = String(Date.now())
  const params = 'appid=1058&global_specialid=' + encodeURIComponent(globalId) +
    '&specialid=0&plat=0&version=8000&page=' + page + '&pagesize=' + pagesize +
    '&srcappid=2919&clientver=20000&clienttime=' + ct + '&mid=' + ct + '&uuid=' + ct + '&dfid=-'
  const r = await __kgReq('https://mobiles.kugou.com/api/v5/special/song_v2?' + params + '&signature=' + __kgSign(params, 'web'), {
    headers: { mid: ct, clienttime: ct, dfid: '-', Referer: 'https://m3ws.kugou.com/share/index.php' },
  })
  const j = r.json
  if (!j) throw new Error('酷狗歌单分页失败：返回不是 JSON')
  if (j.errcode && j.errcode !== 0) {
    if (j.errcode === 20028) throw Object.assign(new Error('酷狗限流'), { code: 20028 })
    throw new Error('酷狗歌单分页失败：errcode=' + j.errcode)
  }
  const d = j.data || {}
  return { total: Number(d.total || 0), list: d.info || [] }
}

async function __kgSongPageAlt (globalId, page, pagesize) {
  const params = 'specialid=0&need_sort=1&module=CloudMusic&clientver=11409&pagesize=' + pagesize +
    '&global_collection_id=' + encodeURIComponent(globalId) +
    '&userid=0&page=' + page + '&type=1&area_code=1&appid=1005'
  const r = await __kgReq('http://pubsongscdn.tx.kugou.com/v2/get_other_list_file?' + params + '&signature=' + __kgSign(params, 'android'), {
    headers: { dfid: '-', 'User-Agent': 'Mozilla/5.0' },
  })
  const j = r.json
  if (!j) throw new Error('酷狗歌单分页失败：返回不是 JSON')
  if (j.error_code && j.error_code !== 0) throw new Error('酷狗歌单分页失败：error_code=' + j.error_code)
  const d = j.data || {}
  return { total: Number(d.count || 0), list: d.info || [] }
}

function __kgFmtTime (sec) {
  const t = Math.max(0, Math.round(Number(sec) || 0))
  return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0')
}

function __kgMapSong (x) {
  const hash = String(x.hash || x.FileHash || '')
  if (!hash) return null
  const fileName = String(x.filename || x.name || '').trim()
  const remark = String(x.remark || '').trim()

  let singer = ''
  if (Array.isArray(x.singerinfo) && x.singerinfo.length) {
    singer = x.singerinfo.map((s) => (s && s.name) || '').filter(Boolean).join('、')
  }
  if (!singer && x.singername) singer = String(x.singername).trim()
  if (!singer && fileName.includes(' - ')) singer = fileName.split(' - ')[0].trim()

  let songName = String(x.songname || '').trim()
  if (!songName && fileName.includes(' - ')) songName = fileName.split(' - ').slice(1).join(' - ').trim()
  if (!songName) songName = fileName
  if (remark && remark !== songName) songName = remark
  if (!songName) songName = '未知歌曲'

  const durSec = x.duration ? Number(x.duration) : Math.round(Number(x.timelen || 0) / 1000)

  let cover = ''
  const tp = x.trans_param || {}
  if (tp.union_cover) cover = tp.union_cover
  else if (tp.union_cover_od) cover = tp.union_cover_od
  else if (typeof x.cover === 'string') cover = x.cover
  else if (Array.isArray(x.cover) && x.cover.length) cover = x.cover[0]
  if (cover) cover = String(cover).replace('{size}', '300')

  const album = (x.albuminfo && x.albuminfo.name) || String(x.album_name || '')

  return {
    id: hash, urlId: hash, lyricId: hash, picId: '',
    name: songName,
    singer: singer || '未知歌手',
    album: album,
    albumId: String(x.album_id || (x.albuminfo && x.albuminfo.id) || ''),
    cover: cover,
    duration: durSec * 1000,
    durationText: __kgFmtTime(durSec),
    fee: (x.feetype || x.pay_type) ? 1 : 0,
    source: 'kg',
    raw: {
      hash, songmid: hash, name: songName, singer,
      albumId: String(x.album_id || ''),
      audioId: x.audio_id || 0,
      albumAudioId: x.album_audio_id || 0,
      _types: { kg: true }, source: 'kg',
    },
  }
}

async function kgGcidPlaylist (gcid, maxSongs) {
  const limitTotal = maxSongs || 2000
  const pageSize = 300
  const globalId = await __kgDecodeGcid(gcid)

  let meta = { name: '酷狗歌单', count: 0, cover: '', intro: '' }
  try { meta = await __kgListInfo(globalId) } catch (e) { }

  const all = []
  const seen = new Set()
  let total = meta.count || 0
  let usedAlt = false

  for (let page = 1; page <= 100 && all.length < limitTotal; page++) {
    let r = null
    try {
      r = await __kgSongPage(globalId, page, pageSize)
    } catch (e) {
      if (!usedAlt) {
        usedAlt = true
        try { r = await __kgSongPageAlt(globalId, page, pageSize) } catch (e2) {
          if (page === 1) throw new Error('酷狗歌单拉取失败：' + e2.message)
          break
        }
      } else if (page === 1) {
        throw new Error('酷狗歌单拉取失败：' + e.message)
      } else { break }
    }
    if (!r) break
    if (r.total > total) total = r.total
    const list = r.list || []
    if (!list.length) break
    for (const x of list) {
      const sm = __kgMapSong(x)
      if (!sm || seen.has(sm.id)) continue
      seen.add(sm.id)
      all.push(sm)
      if (all.length >= limitTotal) break
    }
    if (total && all.length >= total) break
    if (list.length < pageSize) break
    await new Promise((r2) => setTimeout(r2, 200))
  }

  if (!all.length) throw new Error('酷狗歌单是空的')
  return { platform: 'kg', name: meta.name || '酷狗歌单', cover: meta.cover || '', songs: all, total: total || all.length }
}

`

const anchor = 'async function mobileApi (path, opts'
if (!s.includes(anchor)) { console.log('找不到 mobileApi 定义'); process.exit(1) }
s = s.replace(anchor, HELPER + anchor)

fs.writeFileSync(p, s, 'utf8')
console.log('✓ 手机端已接入 kgGcidPlaylist')
