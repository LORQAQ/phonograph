'use strict'
/**
 * 酷狗 gcid 分享歌单的完整实现（照抄洛雪 lx-music-desktop 的思路）
 *
 * 关键发现（实测）：
 *   - m.kugou.com/songlist/gcid_xxx/ 页面里的 window.$output 只有首屏 10 首，
 *     ?page=2 无效，前端 chunk 里也没有翻页接口 —— 那个页面只做「打开 App」引导
 *   - 正确路径是三步：
 *       ① POST t.kugou.com/v1/songlist/batch_decode   gcid → global_collection_id
 *       ② GET  mobiles.kugou.com/api/v5/special/info_v2  拿 songcount
 *       ③ GET  mobiles.kugou.com/api/v5/special/song_v2  按 300/页翻
 *   - 签名：md5(KEY + sort(params.split('&')).join('') + body + KEY)
 *       WEB_KEY = NVPh5oo715z5DIWAeQlhMDsWXXQV4hwt  （appid=1058 / srcappid=2919）
 *       AND_KEY = OIlwieks28dk2k092lksi2UIkp         （appid=1005）
 *     POST 的 body 必须原样（无空格）拼进 md5
 *   - 遇到 errcode=20028 是限流，不是签名错，换 mid/clienttime 或换域名即可
 */

const crypto = require('node:crypto')
const http = require('node:http')
const https = require('node:https')

const WEB_KEY = 'NVPh5oo715z5DIWAeQlhMDsWXXQV4hwt'
const AND_KEY = 'OIlwieks28dk2k092lksi2UIkp'

const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 11_0 like Mac OS X) AppleWebKit/604.1.38 (KHTML, like Gecko) Version/11.0 Mobile/15A372 Safari/604.1'
const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 10; HUAWEI HMA-AL00) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.106 Mobile Safari/537.36'

const md5 = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex')

/** 复刻洛雪 util.js 的 signatureParams */
function signatureParams (params, platform = 'android', body = '') {
  const key = platform === 'web' ? WEB_KEY : AND_KEY
  const sorted = String(params).split('&').sort()
  return md5(key + sorted.join('') + body + key)
}

function request (url, opts = {}) {
  return new Promise((resolve, reject) => {
    let u
    try { u = new URL(url) } catch (e) { return reject(new Error('非法 URL')) }
    const lib = u.protocol === 'https:' ? https : http
    const data = opts.body ? Buffer.from(opts.body, 'utf8') : null
    const req = lib.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: opts.method || 'GET',
      headers: Object.assign({
        'User-Agent': opts.ua || UA_IPHONE,
        Accept: 'application/json, text/plain, */*',
      }, data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {}, opts.headers || {}),
      timeout: opts.timeout || 20000,
      /* P2-11: 三个酷狗域名证书都正常，无条件关校验只是给中间人留门 */
      ...(opts.insecure ? { rejectUnauthorized: false } : {}),
    }, (res) => {
      /* P2-4/P2-10: 用 Buffer.concat 再整体解码 —— d += chunk 会把跨 TCP 分片的
         多字节中文切成 U+FFFD；顺便加 8MB 上限 */
      const chunks = []
      let size = 0
      res.on('data', (c) => {
        size += c.length
        if (size > 8 * 1024 * 1024) { try { res.destroy() } catch (e) { } reject(new Error('响应体过大')); return }
        chunks.push(c)
      })
      res.on('error', reject)
      res.on('end', () => {
        const d = Buffer.concat(chunks).toString('utf8')
        let j = null
        try { j = JSON.parse(d) } catch (e) { }
        resolve({ status: res.statusCode, body: d, json: j })
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
    if (data) req.write(data)
    req.end()
  })
}

/** ① gcid → global_collection_id
 *  注意：t.kugou.com 会返回 err_code=20028（操作太频繁）。
 *  这不是永久失败，换一组 clienttime/mid 并退避重试即可。 */
async function decodeGcid (gcid, attempt) {
  const n = attempt || 0
  /* 每次重试换新的 clienttime/mid，固定值更容易被识别成爬虫 */
  const ct = String(Date.now() + n * 7919)
  const params = 'dfid=-&appid=1005&mid=' + (n === 0 ? '0' : ct) + '&clientver=20109&clienttime=' + ct + '&uuid=-'
  /* body 必须无空格（JSON.stringify 默认无空格） */
  const body = JSON.stringify({ ret_info: 1, data: [{ id: gcid, id_type: 2 }] })
  const sign = signatureParams(params, 'android', body)
  const url = 'https://t.kugou.com/v1/songlist/batch_decode?' + params + '&signature=' + sign
  const r = await request(url, {
    method: 'POST',
    body,
    ua: UA_ANDROID,
    headers: { Referer: 'https://m.kugou.com/' },
  })
  const j = r.json
  if (!j) throw new Error('gcid 解码失败：返回不是 JSON')

  /* 20028 = 限流，退避重试 */
  if (j.err_code === 20028 || j.err_code === 20010) {
    if (n < 3) {
      await new Promise((res) => setTimeout(res, 1200 * (n + 1)))
      return decodeGcid(gcid, n + 1)
    }
    throw Object.assign(new Error('酷狗限流了，请等一两分钟再导入'), { code: 20028 })
  }
  if (j.err_code && j.err_code !== 0) throw new Error('gcid 解码失败：err_code=' + j.err_code)

  const item = j && j.data && j.data.list && j.data.list[0]
  const gid = item && item.global_collection_id
  if (!gid) throw new Error('gcid 解码失败：拿不到 global_collection_id')
  return { globalId: gid, info: item.info || {} }
}

/** ② 歌单元信息（songcount / 名字 / 封面） */
async function getListInfo (globalId) {
  const ct = String(Date.now())
  const params = 'appid=1058&specialid=0&global_specialid=' + encodeURIComponent(globalId) +
    '&format=jsonp&srcappid=2919&clientver=20000&clienttime=' + ct + '&mid=' + ct + '&uuid=' + ct + '&dfid=-'
  const url = 'https://mobiles.kugou.com/api/v5/special/info_v2?' + params +
    '&signature=' + signatureParams(params, 'web')
  const r = await request(url, {
    headers: { mid: ct, clienttime: ct, dfid: '-', Referer: 'https://m3ws.kugou.com/share/index.php' },
  })
  const d = r.json && r.json.data
  if (!d) throw new Error('酷狗歌单信息获取失败')
  return {
    name: d.specialname || d.special_name || '酷狗歌单',
    count: Number(d.songcount || d.song_count || 0),
    cover: String(d.imgurl || d.img_url || '').replace('{size}', '400'),   /* P2-5: 不替换是 404 破图 */
    intro: d.intro || '',
    nickname: d.nickname || '',
    playcount: Number(d.playcount || 0),
  }
}

/** ③ 单页歌曲 */
async function getSongPage (globalId, page, pagesize) {
  const ct = String(Date.now())
  const params = 'appid=1058&global_specialid=' + encodeURIComponent(globalId) +
    '&specialid=0&plat=0&version=8000&page=' + page + '&pagesize=' + pagesize +
    '&srcappid=2919&clientver=20000&clienttime=' + ct + '&mid=' + ct + '&uuid=' + ct + '&dfid=-'
  const url = 'https://mobiles.kugou.com/api/v5/special/song_v2?' + params +
    '&signature=' + signatureParams(params, 'web')
  const r = await request(url, {
    headers: { mid: ct, clienttime: ct, dfid: '-', Referer: 'https://m3ws.kugou.com/share/index.php' },
  })
  const j = r.json
  if (!j) throw new Error('酷狗歌单分页失败：返回不是 JSON')
  if (j.errcode && j.errcode !== 0) {
    if (j.errcode === 20028) throw Object.assign(new Error('酷狗限流'), { code: 20028 })
    throw new Error('酷狗歌单分页失败：errcode=' + j.errcode + ' ' + (j.error || ''))
  }
  const d = j.data || {}
  return { total: Number(d.total || 0), list: d.info || [] }
}

/** ③' 备选：get_other_list_file（pagesize 硬上限 300，data.count 是总数） */
async function getSongPageAlt (globalId, page, pagesize) {
  const params = 'specialid=0&need_sort=1&module=CloudMusic&clientver=11409&pagesize=' + pagesize +
    '&global_collection_id=' + encodeURIComponent(globalId) +
    '&userid=0&page=' + page + '&type=1&area_code=1&appid=1005'
  const url = 'http://pubsongscdn.tx.kugou.com/v2/get_other_list_file?' + params +
    '&signature=' + signatureParams(params, 'android')
  const r = await request(url, { headers: { dfid: '-', 'User-Agent': 'Mozilla/5.0' } })
  const j = r.json
  if (!j) throw new Error('酷狗歌单分页失败：返回不是 JSON')
  if (j.error_code && j.error_code !== 0) {
    throw new Error('酷狗歌单分页失败：error_code=' + j.error_code + ' ' + (j.errmsg || ''))
  }
  const d = j.data || {}
  return { total: Number(d.count || 0), list: d.info || [] }
}

/** 转成项目统一的 song 结构
 *  两个接口字段不一样，这里全部兼容：
 *    song_v2:            filename("歌手 - 歌名") / duration(秒) / 无 singerinfo
 *    get_other_list_file: name("歌手 - 歌名") / timelen(毫秒) / singerinfo[] / albuminfo
 */
function mapKgSong (x) {
  if (!x || typeof x !== 'object') return null
  const hash = String(x.hash || x.FileHash || '')
  if (!hash) return null

  const fileName = String(x.filename || x.name || '').trim()
  const remark = String(x.remark || '').trim()

  /* ---- 歌手 ---- */
  let singer = ''
  if (Array.isArray(x.singerinfo) && x.singerinfo.length) {
    singer = x.singerinfo.map((s) => (s && s.name) || '').filter(Boolean).join('、')
  }
  if (!singer && x.singername) singer = String(x.singername).trim()
  if (!singer && fileName.includes(' - ')) singer = fileName.split(' - ')[0].trim()

  /* ---- 歌名（remark 是中文名，优先显示）---- */
  let songName = String(x.songname || '').trim()
  if (!songName && fileName.includes(' - ')) {
    songName = fileName.split(' - ').slice(1).join(' - ').trim()
  }
  if (!songName) songName = fileName
  if (!songName) songName = '未知歌曲'
  /* P1-3: remark 不是「中文名」，是任意备注（翻译名、电影主题曲说明……）。
     无条件覆盖会把《勋章》变成「《我是证人》电影主题曲」，搜原名也搜不到。
     原名保留，备注放进 alias。 */
  const alias = (remark && remark !== songName) ? remark : ''

  /* ---- 时长：song_v2 给秒，get_other_list_file 给毫秒 ---- */
  const durSec = x.duration
    ? Number(x.duration)
    : Math.round(Number(x.timelen || 0) / 1000)

  /* ---- 封面：优先 trans_param.union_cover，其次 cover（带 {size} 占位）---- */
  let cover = ''
  const tp = x.trans_param || {}
  if (tp.union_cover) cover = tp.union_cover
  else if (tp.union_cover_od) cover = tp.union_cover_od
  else if (typeof x.cover === 'string') cover = x.cover
  else if (Array.isArray(x.cover) && x.cover.length) cover = x.cover[0]
  if (cover) cover = String(cover).replace('{size}', '300')

  /* ---- 专辑 ---- */
  const album = (x.albuminfo && x.albuminfo.name) || String(x.album_name || '')

  return {
    id: hash,
    urlId: hash,
    lyricId: hash,
    picId: '',
    name: songName,
    alias: alias,
    singer: singer || '未知歌手',
    album: album,
    albumId: String(x.album_id || (x.albuminfo && x.albuminfo.id) || ''),
    cover: cover,
    duration: durSec * 1000,        /* 给前端的是毫秒 */
    durationText: fmtTime(durSec),  /* fmtTime 接收秒 */
    fee: (x.feetype || x.pay_type) ? 1 : 0,
    source: 'kg',
    raw: {
      hash, songmid: hash,
      name: songName, singer,
      albumId: String(x.album_id || ''),
      audioId: x.audio_id || 0,
      albumAudioId: x.album_audio_id || 0,
      _types: { kg: true },
      source: 'kg',
    },
  }
}

function fmtTime (sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0))
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0')
}

/** 同一 gcid 的并发导入只打一次酷狗接口（用户连点两次不会触发限流） */
const __gcidInflight = new Map()

/**
 * 拉整张 gcid 歌单（自动翻页 + 按 hash 去重）
 * @returns {{name, cover, intro, songs, total, truncated}}
 */
async function fetchGcidPlaylist (gcid, opts = {}) {
  const key = String(gcid) + '|' + (opts.maxSongs || 2000)
  const existing = __gcidInflight.get(key)
  if (existing) return existing
  const job = __fetchGcidPlaylistInner(gcid, opts).finally(() => __gcidInflight.delete(key))
  __gcidInflight.set(key, job)
  return job
}

async function __fetchGcidPlaylistInner (gcid, opts = {}) {
  const maxSongs = opts.maxSongs || 2000
  const pageSize = 300
  /* 预算必须从函数第一行开始算。
     原先建立在 decodeGcid / getListInfo 之后，解码阶段 4×20s 重试 + 7.2s 退避
     完全不计入，实际最长能到 3 分钟。 */
  const __budget = Number(opts.budgetMs) || 60000
  const __deadline = Date.now() + __budget
  const __expired = () => Date.now() > __deadline

  const { globalId, info: decodeInfo } = await decodeGcid(gcid)

  /* 先拿总数和名字 */
  let meta = { name: '酷狗歌单', count: 0, cover: '', intro: '', nickname: '', playcount: 0 }
  try {
    meta = await getListInfo(globalId)
  } catch (e) {
    /* info_v2 失败不致命，后面按页数翻 */
  }

  const all = []
  const seen = new Set()
  let total = meta.count || 0
  /* P1-1: 把「用哪个接口」做成状态，而不是一次性开关。
     之前 usedAlt 置 true 后，第 2 页仍先打 song_v2，再失败就 break ——
     800 首的歌单只能拿到 300 首。 */
  let backend = 'web'
  let __timedOut = false

  for (let page = 1; page <= 100 && all.length < maxSongs; page++) {
    if (Date.now() > __deadline) { __timedOut = true; break }
    let r = null
    let lastErr = null
    const plan = backend === 'alt' ? ['alt'] : ['web', 'alt']
    for (const b of plan) {
      try {
        r = b === 'web'
          ? await getSongPage(globalId, page, pageSize)
          : await getSongPageAlt(globalId, page, pageSize)
        backend = b      /* 记住能用的那个，后续页不再试坏的 */
        break
      } catch (e) {
        lastErr = e
      }
    }
    if (!r) {
      if (page === 1) throw new Error('酷狗歌单拉取失败：' + (lastErr && lastErr.message))
      break
    }

    if (r.total > total) total = r.total
    const list = r.list || []
    if (!list.length) break

    /* P2-12: 以「本页有没有新增有效歌曲」作为终止条件，
       而不是 list.length < pageSize（上游钳制页大小时会误判结束） */
    let added = 0
    for (const x of list) {
      const sm = mapKgSong(x)
      if (!sm) continue
      if (seen.has(sm.id)) continue
      seen.add(sm.id)
      all.push(sm)
      added++
      if (all.length >= maxSongs) break
    }
    if (!added) break
    if (total && all.length >= total) break
    if (__expired()) { __timedOut = true; break }
    /* 温和一点，别触发限流 */
    await new Promise((r2) => setTimeout(r2, 200))
  }

  if (!all.length) throw new Error('酷狗歌单是空的')

  return {
    platform: 'kg',
    name: meta.name || decodeInfo.title || '酷狗歌单',
    cover: meta.cover || '',
    intro: meta.intro || '',
    songs: all,
    total: total || all.length,
    truncated: total > all.length || __timedOut,
    timedOut: __timedOut,
  }
}

module.exports = {
  fetchGcidPlaylist,
  decodeGcid,
  getListInfo,
  getSongPage,
  getSongPageAlt,
  signatureParams,
  mapKgSong,
  fmtTime,
}
