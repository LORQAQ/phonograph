'use strict'
/* 电脑端接口全量检查 */
const http = require('node:http')

const BASE = 'http://127.0.0.1:37621'

function get (path, timeout = 30000) {
  return new Promise((resolve) => {
    const req = http.get(BASE + path, { timeout }, (res) => {
      let d = ''
      res.on('data', (c) => { d += c })
      res.on('end', () => resolve({ status: res.statusCode, body: d }))
    })
    req.on('error', (e) => resolve({ status: 0, error: e.message }))
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, error: 'timeout' }) })
  })
}

function post (path, obj, timeout = 30000) {
  return new Promise((resolve) => {
    const body = JSON.stringify(obj)
    const u = new URL(BASE + path)
    const req = http.request({
      host: u.hostname, port: u.port, path: u.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout,
    }, (res) => {
      let d = ''
      res.on('data', (c) => { d += c })
      res.on('end', () => resolve({ status: res.statusCode, body: d }))
    })
    req.on('error', (e) => resolve({ status: 0, error: e.message }))
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, error: 'timeout' }) })
    req.write(body)
    req.end()
  })
}

const results = []
function check (name, ok, detail) {
  results.push({ name, ok, detail })
  console.log((ok ? '✓ ' : '✗ ') + name.padEnd(22) + (detail || ''))
}

;(async () => {
  /* 基础 */
  let r = await get('/api/health', 8000)
  check('健康检查', r.status === 200 && r.body.includes('"ok":true'), r.body && r.body.slice(0, 40))

  /* 三平台搜索 */
  for (const s of ['wy', 'tx', 'kg']) {
    r = await get('/api/search?kw=' + encodeURIComponent('周杰伦') + '&page=1&limit=5&source=' + s)
    let n = 0
    try { n = (JSON.parse(r.body).list || []).length } catch (e) { }
    check('搜索 ' + s, n > 0, n + ' 首')
  }

  /* 三平台推荐歌单 */
  const playlistIds = {}
  for (const s of ['wy', 'tx', 'kg']) {
    r = await get('/api/discover?source=' + s + '&offset=0&limit=3')
    let pls = []
    try { pls = JSON.parse(r.body).playlists || [] } catch (e) { }
    if (pls[0]) playlistIds[s] = pls[0].id
    check('推荐 ' + s, pls.length > 0, pls.length + ' 个')
  }

  /* 三平台榜单 */
  for (const s of ['wy', 'tx', 'kg']) {
    r = await get('/api/toplist?source=' + s + '&type=hot')
    let n = 0
    try { n = (JSON.parse(r.body).list || []).length } catch (e) { }
    check('榜单 ' + s, n > 0, n + ' 首')
  }

  /* 歌单预览（三平台） */
  const urls = {
    wy: playlistIds.wy ? 'https://music.163.com/#/playlist?id=' + playlistIds.wy : '',
    tx: playlistIds.tx ? 'https://y.qq.com/n/ryqq/playlist/' + playlistIds.tx : '',
    kg: playlistIds.kg ? 'https://www.kugou.com/yy/special/single/' + playlistIds.kg + '.html' : '',
  }
  for (const s of ['wy', 'tx', 'kg']) {
    if (!urls[s]) { check('歌单 ' + s, false, '无 id'); continue }
    r = await post('/api/playlist', { action: 'preview', url: urls[s] }, 40000)
    let n = 0
    try { n = (JSON.parse(r.body).songs || []).length } catch (e) { }
    check('歌单 ' + s, n > 0, n + ' 首')
  }

  /* 取流 + 播放流（网易云） */
  r = await get('/api/url?id=1974443814&source=wy&quality=320k', 40000)
  let u = ''
  try { u = JSON.parse(r.body).url || '' } catch (e) { }
  check('取流 wy', !!u, u ? u.slice(0, 45) : r.body.slice(0, 60))

  r = await get('/api/stream?id=1974443814&source=wy&quality=320k', 60000)
  check('播放流 wy', r.status === 200 && r.body.length > 100000, (r.body || '').length + ' 字节')

  /* 歌词 / 封面 */
  r = await get('/api/lyric?id=1974443814&source=wy')
  let lyricOk = false
  try { lyricOk = (JSON.parse(r.body).lyric || '').length > 20 } catch (e) { }
  check('歌词', lyricOk)

  r = await get('/api/pic?id=1974443814&source=wy')
  let picOk = false
  try { picOk = !!JSON.parse(r.body).url } catch (e) { }
  check('封面', picOk)

  /* 音源 */
  r = await get('/api/sources', 20000)
  let srcs = []
  try { srcs = JSON.parse(r.body).list || JSON.parse(r.body).sources || [] } catch (e) { }
  check('音源列表', srcs.length > 0, srcs.length + ' 个（' + srcs.filter((x) => x.status === 'ok').length + ' 正常）')

  /* 下载相关 */
  r = await get('/api/download-dir', 10000)
  check('下载目录', r.status === 200 && r.body.includes('"dir"'), r.body.slice(0, 60))

  r = await get('/api/downloads', 10000)
  let files = []
  try { files = JSON.parse(r.body).files || [] } catch (e) { }
  check('下载列表', r.status === 200, files.length + ' 个文件')

  r = await get('/api/download?id=1974443814&source=wy&quality=320k&format=mp3&save=1', 120000)
  let saved = false
  try { saved = JSON.parse(r.body).ok === true } catch (e) { }
  check('下载落盘', saved, saved ? 'OK' : r.body.slice(0, 80))

  /* 设置 */
  r = await get('/api/settings', 10000)
  check('设置读写', r.status === 200 && r.body.includes('quality'))

  const ok = results.filter((x) => x.ok).length
  console.log('\n===== ' + ok + ' / ' + results.length + ' 通过 =====')
  const fail = results.filter((x) => !x.ok)
  if (fail.length) {
    console.log('失败项：')
    fail.forEach((f) => console.log('  - ' + f.name + ' ' + (f.detail || '')))
  }
})()
