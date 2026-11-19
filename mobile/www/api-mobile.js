/* 留声 · 手机端数据层（无服务端）
 * 把 /api/* 请求映射到直接调用各平台接口，HTTP 由原生桥 NAPI 完成（绕开 CORS）
 */
(function () {
  'use strict'

  const LS = {
    get (k, d) {
      try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d } catch (e) { return d }
    },
    set (k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch (e) {} },
  }

  /* ---------- 原生 HTTP 桥 ---------- */
  function nativeHttp (url, opts) {
    return window.NativeHttp.request(url, opts)
  }

  /* netease/qq/kugou 模块使用的回调式 request */
  globalThis.__REQ__ = function request (url, opts, cb) {
    nativeHttp(url, opts).then((r) => {
      cb(null, { statusCode: r.status || 200, body: r.body || '', headers: r.headers || {} })
    }).catch((e) => cb(e))
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

  /* ---------- 本地歌单存储 ---------- */
  function db () {
    const d = LS.get('lx.db', null)
    if (d && d.playlists) return d
    const init = {
      playlists: [{ id: 'default', name: '默认列表', songs: [], createdAt: Date.now() }],
      settings: { quality: '320k' },
      history: [],
    }
    LS.set('lx.db', init)
    return init
  }
  function saveDb (d) { LS.set('lx.db', d) }

  function newId () { return 'pl' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }

  /* ---------- 播放地址 ---------- */

  /* ---------- 歌单导入（手机端） ---------- */
  function parsePlaylistUrl (raw) {
    const u = String(raw || '').trim()
    if (!u) return null
    /* P2-7(手机端): 用户从酷狗 App 复制到的常常只有 gcid_xxx，没有 URL 外壳。
       这一条必须放在最前面，否则会被后面的正则全部错过。 */
    if (/^gcid_[a-z0-9]{8,}$/i.test(u)) return { platform: 'kg', id: u }
    if (/^[a-z0-9]{14,}$/i.test(u) && /[a-z]/i.test(u)) return { platform: 'kg', id: u }
    /* 纯数字且 4 位以上当网易云 id */
    if (/^\d{4,}$/.test(u)) return { platform: 'wy', id: u }
    /* 网易云 */
    let m = u.match(/music\.163\.com[^#]*[#/]playlist\?[^#]*id=(\d+)/) || u.match(/[?&]id=(\d+)/)
    if (/music\.163\.com/.test(u) && m) return { platform: 'wy', id: m[1] }
    /* QQ 音乐：支持三种写法
       y.qq.com/n/ryqq/playlist/123
       y.qq.com/.../playlist.html?...&id=123
       i2.y.qq.com/n3/other/pages/details/playlist.html?...&id=123      */
    if (/qq\.com/.test(u)) {
      m = u.match(/playlist\/(\d+)/) ||
          u.match(/[?&](?:id|disstid)=(\d+)/) ||
          u.match(/playlist\.html[^#]*[?&]id=(\d+)/)
      if (m) return { platform: 'tx', id: m[1] }
    }
    /* 酷狗：两种写法
       kugou.com/yy/special/single/123.html        （数字 id）
       m.kugou.com/songlist/gcid_xxxx/             （gcid）  */
    if (/kugou\.com/.test(u)) {
      m = u.match(/special\/single\/(\d+)/)
      if (m) return { platform: 'kg', id: m[1] }
      m = u.match(/(gcid_[a-z0-9]+)/i)
      if (m) return { platform: 'kg', id: m[1] }
      m = u.match(/songlist\/([a-z0-9_]+)/i)
      if (m) return { platform: 'kg', id: m[1] }
    }
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
      try { j = JSON.parse(String(r.body).replace(/^callback\(/, '').replace(/\)$/, '')) } catch (e) { }
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

    if (platform === 'kg') {
      /* gcid 走 HTML 解析 */
      /* gcid_ 歌单：照洛雪的路子 —— batch_decode 解码 → info_v2 拿总数 → song_v2 按 300/页翻。
         之前解析 m.kugou.com 的 HTML 只能拿到 SSR 首屏 10 首，?page=2 无效。 */
      /* M15: 14 位以上纯数字是老的 specialid，不是 gcid */
      if (/^gcid_/i.test(id) || (/^[a-z0-9]{14,}$/i.test(id) && !/^[0-9]+$/.test(id))) {
        /* M4: 正则用 /i 放行了大写，拼装也要大小写不敏感 */
        const gid = /^gcid_/i.test(id) ? ('gcid_' + String(id).replace(/^gcid_/i, '')) : ('gcid_' + id)
        const r = await kgGcidPlaylist(gid, 2000)
        return {
          platform: 'kg',
          name: r.name || '酷狗歌单',
          cover: r.cover || '',
          songs: r.songs,
          total: r.total,
          truncated: !!r.truncated,
        }
      }
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
          const songName = (t.songname || parts[1] || fn).replace(/\.(mp3|flac|m4a)$/i, '').trim()
          const hash = String(t.hash || '')
          if (!hash || !songName) continue
          songs.push({
            id: hash,
            source: 'kg',
            name: songName,
            singer: (t.singername || parts[0] || '').trim(),
            album: t.remark || '',
            durationText: msToText(Number(t.duration || 0) * 1000),
            cover: (function (t) { var u = (t && (t.union_cover || t.union_cover_od)) || ''; if (u) return String(u).replace('{size}', '300'); return hash ? ('https://imge.kugou.com/stdmusic/240/' + hash.substring(0, 2) + '/' + hash + '.jpg') : '' })(t.trans_param),
            /* 酷狗取流需要 album_id */
            albumId: t.album_id ? String(t.album_id) : '',
          })
        }
        const total = arr.length
        if (total < 100) break
      }

      if (!songs.length) throw new Error('酷狗歌单读取失败（可能不是公开歌单）')

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

      return { platform, name: plName, songs, skipped: 0 }
    }
  }

  function msToText (ms) {
    if (!ms) return ''
    const s2 = Math.round(ms / 1000)
    return Math.floor(s2 / 60) + ':' + String(s2 % 60).padStart(2, '0')
  }

  async function resolveUrl (id, source, quality) {
    source = source || 'wy'

    /* ① 先走音源脚本（5 个音源都支持 kw/kg/tx/wy/mg） */
    const M = window.LxScriptManager
    if (M && M.scripts && M.scripts.size) {
      try {
        const mi = {
          songmid: id,
          songId: id,
          hash: id,
          name: '',
          singer: '',
          albumName: '',
          interval: '00:00',
          _types: {},
        }
        const hit = await M.resolve(source, mi, quality, '')
        /* 不支持格式过滤 */
        if (hit && hit.url) {
          const uu = String(hit.url).toLowerCase()
          /* 裸 aac/wma 在 WebView 播不了，跳过换下一个音源 */
          if (!/\.(aac|wma|ape|cue)(\?|$)/.test(uu)) return hit
        }
      } catch (e) {
        console.warn('[取流] 脚本失败', source, e && e.message)
      }
    }

    /* ② 回落：各平台直链 */
    if (source === 'wy') {
      const u = 'https://music.163.com/song/media/outer/url?id=' + encodeURIComponent(id) + '.mp3'
      let status = 0
      let nativeOk = false
      let ct = ''
      try {
        if (window.NAPI && window.NAPI.probe) {
          const raw = JSON.parse(window.NAPI.probe(u))
          status = Number(raw && raw.status) || 0
          nativeOk = raw && raw.ok === true
          ct = String((raw && raw.type) || '')
        }
      } catch (e) { }
      /* 外链占位不采用（302 到失效地址，播放必失败） */
      throw new Error('网易云外链不可用，换一首试试')
      throw new Error('这首取不到播放地址（可能是 VIP 歌），换一首试试')
    }

    if (source === 'kg') {
      /* play/getdata 要签名（err_code 30020），改用 m.kugou.com 的 getSongInfo（实测可用） */
      const kgHeaders = {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36',
        Referer: 'https://m.kugou.com/',
      }
      let u = ''
      let bitrate = 0

      /* ① getSongInfo（最稳） */
      try {
        const r = await nativeHttp('http://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash=' + encodeURIComponent(id), {
          headers: kgHeaders,
          insecure: true,
        })
        let j = null
        try { j = JSON.parse(r.body) } catch (e) { }
        if (j) {
          u = j.url || j.play_url || (j.backup_url && j.backup_url[0]) || ''
          bitrate = Number(j.bitRate || j.bitrate || 0)
        }
      } catch (e) { }

      /* ② wwwapi 兜底（不需要 album_id） */
      if (!u) {
        try {
          const r2 = await nativeHttp('https://wwwapi.kugou.com/yy/index.php?r=play/getdata&hash=' + encodeURIComponent(id) + '&dfid=1&mid=1&platid=4', {
            headers: Object.assign({ Cookie: 'kg_mid=1; kg_dfid=1' }, kgHeaders),
            insecure: true,
          })
          let j2 = null
          try { j2 = JSON.parse(r2.body) } catch (e) { }
          if (j2 && j2.data) {
            u = j2.data.play_url || j2.data.play_backup_url || ''
            bitrate = Number(j2.data.bitrate || 0)
          }
        } catch (e) { }
      }

      if (!u) throw new Error('酷狗这首取不到地址，换一首或换个平台')
      /* 有些返回带反斜杠转义 */
      u = String(u).replace(/\\\//g, '/')
      return { url: u, quality: bitrate ? Math.round(bitrate / 1000) + 'k' : 'standard', provider: '酷狗直链' }
    }

    throw new Error('这首取不到播放地址，换一首或换个平台')
  }

  /* ---------- 路由 ---------- */
  
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
  /* M8: 别把计算异常也报成「缺库」，那样排查方向全错 */
  if (!window.CryptoJS || !window.CryptoJS.MD5) throw new Error('缺少 CryptoJS.MD5，无法签名')
  return window.CryptoJS.MD5(String(str)).toString()
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
    timeout: 40000,   /* M11: Java 侧 connect 12s + read 20s = 32s，JS 超时不能短于它 */
  })
  let j = null
  try { j = JSON.parse(String(r.body || '')) } catch (e) { }
  return { status: r.statusCode || 0, json: j, raw: r.body }
}

async function __kgDecodeGcid (gcid, n) {
  /* M2: 与电脑端对齐 —— 20028 是限流不是永久失败。
     写死的 clienttime/mid 会让重试永远是同一个签名请求，永远恢复不了。 */
  const attempt = n || 0
  const ct = String(Date.now() + attempt * 7919)
  const params = 'dfid=-&appid=1005&mid=' + (attempt === 0 ? '0' : ct) +
    '&clientver=20109&clienttime=' + ct + '&uuid=-'
  const body = JSON.stringify({ ret_info: 1, data: [{ id: gcid, id_type: 2 }] })
  const sign = __kgSign(params, 'android', body)
  const r = await __kgReq('https://t.kugou.com/v1/songlist/batch_decode?' + params + '&signature=' + sign, {
    method: 'POST', body, ua: __KG_UA_ANDROID, headers: { Referer: 'https://m.kugou.com/' },
  })
  const j = r.json
  if (!j) throw new Error('gcid 解码失败：返回不是 JSON')
  const code = Number(j.err_code || 0)
  if (code === 20028 || code === 20010) {
    if (attempt < 3) {
      await new Promise((res) => setTimeout(res, 1200 * (attempt + 1)))
      return __kgDecodeGcid(gcid, attempt + 1)
    }
    throw new Error('酷狗限流了，请等一两分钟再导入')
  }
  if (code !== 0) throw new Error('gcid 解码失败：err_code=' + code)
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
  if (!t) return ''    /* M10: 与其它平台的 msToText 保持一致，空时长不显示 0:00 */
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
  if (!songName) songName = '未知歌曲'
  /* P1-3: remark 是任意备注（翻译名、《我是证人》电影主题曲……），
     覆盖会把真歌名弄丢，搜原名搜不到。原名保留，备注进 alias。 */
  const __alias = (remark && remark !== songName) ? remark : ''

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
    alias: __alias,
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

async function kgGcidPlaylist (gcid, maxSongs, opts) {
  const limitTotal = maxSongs || 2000
  const pageSize = 300
  const globalId = await __kgDecodeGcid(gcid)

  let meta = { name: '酷狗歌单', count: 0, cover: '', intro: '' }
  try { meta = await __kgListInfo(globalId) } catch (e) { }

  const all = []
  const seen = new Set()
  let total = meta.count || 0
  let usedAlt = false
  /* 总预算：单请求 40s 超时，但翻页没有总上限 */
  const __budget = Number(opts && opts.budgetMs) || 60000
  const __deadline = Date.now() + __budget
  let __timedOut = false

  for (let page = 1; page <= 100 && all.length < limitTotal; page++) {
    if (Date.now() > __deadline) { __timedOut = true; break }
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
  /* M3: 中途被限流截断时要告诉上层，别让用户以为导全了 */
  return {
    platform: 'kg',
    name: meta.name || '酷狗歌单',
    cover: meta.cover || '',
    songs: all,
    total: total || all.length,
    got: all.length,
    truncated: (total || 0) > all.length,
  }
}

async function mobileApi (path, opts = {}) {
    const u = new URL(path, 'http://m.local')
    const p = u.pathname
    const q = u.searchParams
    const body = opts.body || {}

    if (p === '/api/health') return { ok: true, mobile: true, version: '1.0.0' }
    if (p === '/api/lan') return { url: '', urls: [] }

    if (p === '/api/search') {
      const kw = (q.get('kw') || '').trim()
      if (!kw) throw new Error('缺少搜索关键词')
      const page = Number(q.get('page') || 1)
      const limit = Math.min(60, Number(q.get('limit') || 30))
      const source = q.get('source') || 'wy'
      if (source === 'tx') return await NET_TX.search(kw, page, limit)
      if (source === 'kg') return await NET_KG.search(kw, page, limit)
      return await NET_WY.search(kw, page, limit)
    }

    if (p === '/api/toplist') {
      const source = q.get('source') || 'wy'
      const type = q.get('type') || 'hot'
      if (source === 'tx') return await NET_TX.toplist(type)
      if (source === 'kg') return await NET_KG.toplist(type)
      return await NET_WY.toplist(type)
    }

    if (p === '/api/discover') {
      const source = q.get('source') || 'wy'
      const offset = Math.max(0, Number(q.get('offset') || 0))
      const limit = Math.min(60, Math.max(6, Number(q.get('limit') || 30)))
      /* P2-8: 「发现页」只放本平台内容。原来 tx/kg 分支也去拉网易云新歌 ——
         切到 QQ/酷狗显示的却是网易云的歌，而且桌面端这些分支返回 []，两端不一致。 */
      const __newSongs = (plat) => {
        if (plat !== 'wy') return []
        return NET_WY.newSongs ? NET_WY.newSongs(10).catch(() => []) : []
      }
      if (source === 'tx') {
        const playlists = await NET_TX.recommendPlaylists(offset, limit)
        return { platform: source, offset, playlists, newSongs: await __newSongs('tx') }
      }
      if (source === 'kg') {
        const playlists = await NET_KG.recommendPlaylists(offset, limit)
        return { platform: source, offset, playlists, newSongs: await __newSongs('kg') }
      }
      {
        const playlists = await NET_WY.recommendPlaylists(offset, limit)
        return { platform: source, offset, playlists, newSongs: await __newSongs('wy') }
      }
    }

    if (p === '/api/lyric') {
      const id = q.get('id')
      const source = q.get('source') || 'wy'
      if (source === 'tx') return await NET_TX.lyric(id)
      if (source === 'kg') return await NET_KG.lyric(id, q.get('interval') || '')
      return await NET_WY.lyric(id)
    }

    if (p === '/api/url') {
      const id = q.get('id')
      if (!id) throw new Error('缺少歌曲 id')
      const source = q.get('source') || 'wy'
      const wantFormat = q.get('format') === 'flac' ? 'flac' : 'mp3'
      const quality = wantFormat === 'flac' ? 'flac' : (q.get('quality') || '320k')
      const mi = {
        musicId: id,
        id,
        songId: id,
        songmid: id,
        songMid: id,
        hash: id,
        copyrightId: id,
        rid: id,
        strMediaMid: q.get('mediaMid') || id,
        mediaMid: q.get('mediaMid') || id,
        name: q.get('name') || '',
        singer: q.get('singer') || '',
        albumName: q.get('album') || '',
        album: q.get('album') || '',
        albumId: '',
        interval: q.get('interval') || '',
        source,
        sourceId: source,
        types: [],
        _types: {},
        meta: {
          songId: id,
          musicId: id,
          songmid: id,
          hash: id,
          albumName: q.get('album') || '',
          qualitys: [],
        },
      }
      // 1) 优先用音源脚本（支持 VIP / QQ 音乐）
      if (window.LxScriptManager) {
        try {
          await ensureScripts()
          const hit = await window.LxScriptManager.resolve(source, mi, quality, q.get('only') || '')
          if (hit && hit.url) return { id, source, url: hit.url, quality, provider: hit.provider, via: 'script' }
        } catch (e) { /* 脚本失败则回退 */ }
      }
      // 2) 回退到平台直链
      try {
        const r = await resolveUrl(id, source, quality)
        return Object.assign({ id, source, via: 'direct' }, r)
      } catch (e) {
        // 3) 跨平台兜底：用歌名+歌手去 QQ / 酷狗找同款资源
        const kw = ((mi.name || '') + ' ' + (mi.singer || '')).trim()
        if (kw && window.LxScriptManager) {
          for (const plat of ['kg', 'tx']) {
            if (plat === source) continue
            try {
              const lib = plat === 'tx' ? NET_TX : NET_KG
              const sr = await lib.search(kw, 1, 2)
              for (const s2 of (sr.list || []).slice(0, 2)) {
                const alt = Object.assign({}, mi, {
                  musicId: s2.id, id: s2.id, songmid: s2.id, hash: s2.id,
                  source: plat, name: s2.name || mi.name, singer: s2.singer || mi.singer,
                  albumName: s2.album || mi.albumName,
                })
                const hit = await window.LxScriptManager.resolve(plat, alt, quality)
                if (hit && hit.url) {
                  return {
                    id, source, url: hit.url, quality: hit.quality || quality,
                    provider: (hit.provider || plat) + '（跨平台·' + plat + '）', via: 'cross',
                  }
                }
              }
            } catch (e2) { }
          }
        }
        throw e
      }
    }

    if (p === '/api/pic') {
      const direct = q.get('url')
      if (direct) return { url: direct }
      const id = q.get('id')
      const source = q.get('source') || 'wy'
      let url = ''
      if (source === 'tx') url = await NET_TX.pic({ picId: id })
      else if (source === 'kg') url = await NET_KG.pic({ cover: id })
      else url = await NET_WY.pic(id)
      return { url: url || '' }
    }

    /* ---- 歌单 ---- */
    if (p === '/api/db') {
      const d = db()
      return { playlists: d.playlists, settings: d.settings, history: d.history }
    }

    if (p === '/api/playlist') {
      const action0 = body.action || q.get('action')
      const d0 = db()

      /* B1: preview 和 import 必须按前端期望的结构返回 */
      if (action0 === 'preview' || action0 === 'import') {
        const url = body.url || q.get('url') || ''
        const r0 = await importPlaylistMobile(url)
        const songs = r0.songs || []
        if (action0 === 'preview') {
          return {
            preview: { name: r0.name, count: songs.length, platform: r0.platform, cover: r0.cover || '' },
            songs,
          }
        }
        /* import：落库并返回 playlists + imported */
        const pl = {
          id: 'pl' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          name: r0.name || '导入歌单',
          songs,
          platform: r0.platform,
          cover: r0.cover || '',
          createdAt: Date.now(),
        }
        /* B19: importPlaylistMobile 可能要跑几秒到几十秒，期间用户可能新建/改名了别的歌单。
           d0 是 await 之前取的快照，直接写回会把期间的改动整份覆盖掉。这里重新读一次。 */
        const d1 = db()
        if (!Array.isArray(d1.playlists)) d1.playlists = []
        d1.playlists.push(pl)
        saveDb(d1)
        return {
          playlists: d1.playlists,
          imported: { id: pl.id, name: pl.name, count: songs.length, platform: r0.platform },
        }
      }

      const d = d0
      if (opts.method === 'POST') {
        const action = body.action
        if (action === 'create') {
          const pl = { id: newId(), name: body.name || '新歌单', songs: [], createdAt: Date.now() }
          d.playlists.push(pl); saveDb(d); return { playlist: pl, playlists: d.playlists }
        }
        if (action === 'rename') {
          const pl = d.playlists.find((x) => x.id === body.id)
          if (pl) pl.name = body.name || pl.name
          saveDb(d); return { playlists: d.playlists }
        }
        if (action === 'delete') {
          d.playlists = d.playlists.filter((x) => x.id !== body.id)
          saveDb(d); return { playlists: d.playlists }
        }
        if (action === 'add') {
          /* B2: 兼容前端传的 listId / song */
          const listId = body.listId || body.id
          const pl = d.playlists.find((x) => x.id === listId)
          if (pl && body.song) {
            const key = (s) => (s.source || 'wy') + '|' + String(s.id)
            if (!pl.songs.some((s) => key(s) === key(body.song))) pl.songs.push(body.song)
            saveDb(d)
            return { ok: true, playlists: d.playlists }
          }
          throw new Error('歌单不存在：' + listId)
        }
        if (action === 'remove') {
          /* B2: 兼容 listId/songId 与 id/id */
          const listId = body.listId || body.id
          /* B20: 前端发的是 { listId, id: song.id }，body.id 也要认 */
          const songId = body.songId != null ? body.songId
            : (body.song && body.song.id != null ? body.song.id : body.id)
          const pl = d.playlists.find((x) => x.id === listId)
          if (pl) {
            pl.songs = (pl.songs || []).filter((s) => String(s.id) !== String(songId))
            saveDb(d)
            return { ok: true, playlists: d.playlists }
          }
          throw new Error('歌单不存在：' + listId)
        }
        if (action === 'remove') {
          const pl = d.playlists.find((x) => x.id === body.id)
          if (pl) pl.songs = pl.songs.filter((s) => String(s.id) !== String(body.songId))
          saveDb(d); return { playlists: d.playlists }
        }
        if (action === 'clear') {
          const pl = d.playlists.find((x) => x.id === body.id)
          if (pl) pl.songs = []
          saveDb(d); return { playlists: d.playlists }
        }
        if (action === 'preview' || action === 'import') {
          const url = body.url
          if (!url) throw new Error('缺少歌单链接')
          const r = await NET_IMPORT.importPlaylist(url)
          if (action === 'preview') {
            return { preview: { name: r.name, count: (r.songs || []).length, platform: r.platform, cover: r.cover || '' }, songs: r.songs || [] }
          }
          const pl = {
            id: newId(),
            name: r.name || '导入歌单',
            songs: r.songs || [],
            createdAt: Date.now(),
            platform: r.platform,
            cover: r.cover || '',
          }
          d.playlists.push(pl)
          saveDb(d)
          return { playlists: d.playlists, imported: { id: pl.id, name: pl.name, count: pl.songs.length, skipped: r.skipped || 0 } }
        }
      }
      return { playlists: d.playlists }
    }

    if (p === '/api/settings') {
      const d = db()
      if (opts.method === 'POST' && body) { Object.assign(d.settings, body); saveDb(d) }
      return d.settings
    }

    if (p === '/api/sources') {
      const M = window.LxScriptManager
      if (opts.method === 'POST' && M) {
        const action = body.action
        if (action === 'toggle') return { list: M.toggle(body.id, !!body.enabled) }
        if (action === 'reload') return { list: await M.reload(body.id) }
        if (action === 'remove') return { list: M.remove(body.id) }
        if (action === 'import') {
          let code = body.code
          if (!code && body.url) {
            const r = await nativeHttp(body.url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
            code = r.body
          }
          if (!code) throw new Error('缺少脚本内容')
          const id = 'custom_' + Date.now().toString(36)
          return { list: await M.addCode(id, code, body.name) }
        }
      }
      /* B73: 冷启动直接进设置→音源时，脚本还没加载完，会显示 0/0。
         这里确保至少触发一次加载（ensureScripts 内部有去重，不会重复跑）。 */
      try {
        if (typeof ensureScripts === 'function') {
          await Promise.race([
            ensureScripts(),
            new Promise((r) => setTimeout(r, 6000)),
          ])
        }
      } catch (e) { }
      return { list: M ? M.list() : [], defaultOrder: [] }
    }

    if (p === '/api/sources/test') {
      const M = window.LxScriptManager
      const platform = q.get('source') || ''
      const list = M ? await M.testAll(platform) : []
      return { id: q.get('id') || '', source: platform, list }
    }

    /* B23: 之前整个 /api/sources/* 子树被一个兜底吃掉，什么也不做直接返回 200 —— 
       禁用/重载/导入/删除四个操作全部静默失效。这里真正派发。 */
    if (p.startsWith('/api/sources/')) {
      const M = window.LxScriptManager
      if (!M) throw new Error('音源管理器未就绪，请稍后重试')
      const action = p.slice('/api/sources/'.length)

      if (opts.method === 'POST' || action !== 'list') {
        if (action === 'toggle') {
          const r = M.toggle(body && body.id, !!(body && body.enabled))
          return { list: r || M.list() }
        }
        if (action === 'reload') {
          if (body && body.id) await M.reload(body.id)
          else await M.loadAll(window.LX_SOURCES || [])
          return { list: M.list() }
        }
        if (action === 'remove') {
          M.remove(body && body.id)
          return { list: M.list() }
        }
        if (action === 'import') {
          let code = (body && body.code) || ''
          if (!code && body && body.url) {
            const r = await nativeHttp(body.url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
            code = r.body || ''
          }
          if (!code) throw new Error('缺少脚本内容')
          if (String(code).length > 2 * 1024 * 1024) throw new Error('脚本超过 2MB，拒绝导入')
          const id = 'custom_' + Date.now().toString(36)
          await M.addCode(id, code, (body && body.name) || id)
          return { list: M.list() }
        }
      }
      return { list: M.list() }
    }

    if (p === '/api/download') throw new Error('手机端暂不支持直接下载，请用电脑端')

    /* B74: 未实现接口返回可渲染的空结构，不要让前端吃 unhandled rejection */
    if (p.startsWith('/api/downloads')) return { list: [], total: 0 }
    if (p === '/api/download-dir') return { dir: '' }
    console.warn('[api-mobile] 未实现:', p)
    return { ok: false, error: '手机端不支持这个接口：' + p }
  }

  let scriptsLoading = null
  /* 只加载实际会用到的几个音源，避免 50+ 个混淆脚本把手机内存撑爆 */
  const KEEP = ['dujia6', 'kxh', 'yuxi', 'changqing2', 'freelisten', 'fish']
  function pickSources () {
    const all = window.LX_SOURCES || []
    const picked = all.filter((s) => KEEP.includes(s.id))
    console.log('[音源] 候选', all.length, '个，选用', picked.length, '个：', picked.map((s) => s.id).join(','))
    return picked.length ? picked : all
  }
  async function ensureScripts () {
    const M = window.LxScriptManager
    if (!M || !window.LX_SOURCES) return
    if (M.ready) return
    if (!scriptsLoading) scriptsLoading = M.loadAll(pickSources())
    try { await scriptsLoading } catch (e) {}
  }
  window.ensureScripts = ensureScripts

  /* B18: /api/url 的缓存层放在这里，不改 mobileApi 内部结构（避免破坏大函数的括号配平）。
     手机端原来每播一首都要重新跑 fish×3 + 5 源竞速，同一首歌前端还会并发打两次；
     这里做 in-flight 合并 + 4 分钟 TTL。 */
  const __urlCache = new Map()
  const __urlInflight = new Map()
  const __URL_TTL = 4 * 60e3

  const __mobileApiRaw = mobileApi
  window.mobileApi = function cachedMobileApi (path, opts = {}) {
    if (!String(path).startsWith('/api/url')) return __mobileApiRaw(path, opts)
    let key = ''
    try {
      const u = new URL(path, 'http://m.local')
      const q = u.searchParams
      /* 缓存 key 必须包含所有参与取流的参数。
         只取 4 个字段会出两个 bug：
         1) format 没进 key → 播放缓存的 mp3 直链会被 FLAC 下载命中（下到 mp3 但文件名 .flac）
         2) mediaMid/name/singer 没进 key → QQ 同 songmid 不同文件、跨平台兜底搜词不同也会被合并 */
      key = [
        q.get('id'), q.get('source') || 'wy', q.get('quality') || '320k',
        q.get('format') || '', q.get('only') || '',
        q.get('mediaMid') || '', q.get('name') || '', q.get('singer') || '',
      ].join('|')
    } catch (e) {
      return __mobileApiRaw(path, opts)
    }
    /* force / noCache：失败重试时必须能绕过缓存 */
    const __force = !!(opts && (opts.force || opts.noCache))
    if (!__force) {
      const hit = __urlCache.get(key)
      if (hit && hit.exp > Date.now()) {
        /* 返回浅拷贝：调用方改 d.url 不会污染全局缓存 */
        return Promise.resolve(Object.assign({}, hit.value))
      }
    }
    if (__force) { __urlCache.delete(key); __urlInflight.delete(key) }
    if (__urlInflight.has(key)) return __urlInflight.get(key)
    const job = __mobileApiRaw(path, opts).then((r) => {
      if (r && r.url) {
        __urlCache.set(key, { value: r, exp: Date.now() + __URL_TTL })
        if (__urlCache.size > 200) __urlCache.delete(__urlCache.keys().next().value)
      }
      return r
    }).finally(() => {
      __urlInflight.delete(key)
    })
    __urlInflight.set(key, job)
    return job
  }

  window.__MOBILE__ = true

/* 后台预热：脚本初始化不阻塞首次播放 */
window.preloadScripts = function () {
  if (window.__scriptsPreloading) return window.__scriptsPreloading
  window.__scriptsPreloading = (async () => {
    try {
      await ensureScripts()
      console.log('[留声] 音源预热完成', (window.LxScriptManager && window.LxScriptManager.list().length) || 0)
    } catch (e) {
      console.warn('[留声] 音源预热失败', e && e.message)
    }
  })()
  return window.__scriptsPreloading
}

  console.log('[留声] 手机端数据层已加载')
})()
