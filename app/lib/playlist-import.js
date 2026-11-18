'use strict'
/*
 * 歌单导入：识别链接 -> 拉取歌单 -> 统一成 songRow 结构
 * 支持：网易云 / QQ 音乐 / 酷狗
 */
const netease = require('./netease.js')
const qq = require('./qq.js')
const kugou = require('./kugou.js')

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
    const { request } = require('./lx-engine.js')
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
  const api = require('./kugou.js')
  const { request } = require('./lx-engine.js')
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
    const { request } = require('./lx-engine.js')
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

module.exports = { importPlaylist, detect }
