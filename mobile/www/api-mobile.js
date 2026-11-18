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
    /* 网易云 */
    let m = u.match(/music\.163\.com[^#]*[#/]playlist\?[^#]*id=(\d+)/) || u.match(/[?&]id=(\d+)/)
    if (/music\.163\.com/.test(u) && m) return { platform: 'wy', id: m[1] }
    /* QQ 音乐 */
    m = u.match(/y\.qq\.com[^#]*playlist\/(\d+)/) || u.match(/playlist\/(\d+)/)
    if (/qq\.com/.test(u) && m) return { platform: 'tx', id: m[1] }
    /* 酷狗 */
    m = u.match(/kugou\.com[^#]*special\/single\/(\d+)/) || u.match(/special\/single\/(\d+)/)
    if (/kugou\.com/.test(u) && m) return { platform: 'kg', id: m[1] }
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
      if (source === 'tx') return { platform: source, offset, playlists: await NET_TX.recommendPlaylists(offset, limit), newSongs: [] }
      if (source === 'kg') return { platform: source, offset, playlists: await NET_KG.recommendPlaylists(offset, limit), newSongs: [] }
      return { platform: source, offset, playlists: await NET_WY.recommendPlaylists(offset, limit), newSongs: [] }
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
        if (!Array.isArray(d0.playlists)) d0.playlists = []
        d0.playlists.push(pl)
        saveDb(d0)
        return {
          playlists: d0.playlists,
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
          const songId = body.songId || (body.song && body.song.id)
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
      return { list: M ? M.list() : [], defaultOrder: [] }
    }

    if (p === '/api/sources/test') {
      const M = window.LxScriptManager
      const platform = q.get('source') || ''
      const list = M ? await M.testAll(platform) : []
      return { id: q.get('id') || '', source: platform, list }
    }

    if (p.startsWith('/api/sources/')) {
      const M = window.LxScriptManager
      return { ok: true, list: M ? M.list() : [] }
    }

    if (p === '/api/download') throw new Error('手机端暂不支持直接下载，请用电脑端')

    throw new Error('未实现的接口: ' + p)
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

  window.__MOBILE__ = true
  window.mobileApi = mobileApi

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
