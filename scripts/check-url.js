'use strict'
/* 校验音源返回的播放地址是否真的可下载：node scripts/check-url.js */
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const https = require('node:https')
const { LxScript } = require('../app/lib/lx-engine.js')
const { gdRequest } = require('../app/lib/gdstudio.js')

const DIR = path.join(__dirname, '..', 'sources', 'raw')
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

function head (url, headers = {}, bytes = 65536) {
  return new Promise((resolve) => {
    let u
    try { u = new URL(url) } catch (e) { return resolve({ ok: false, err: 'bad url' }) }
    const lib = u.protocol === 'https:' ? https : http
    const req = lib.get(u, { headers: Object.assign({ 'User-Agent': UA, Range: 'bytes=0-' + bytes }, headers), timeout: 20000 }, (res) => {
      let n = 0
      res.on('data', (c) => { n += c.length; if (n > bytes) req.destroy() })
      res.on('end', () => resolve({ ok: res.statusCode < 400, code: res.statusCode, type: res.headers['content-type'], len: n }))
      res.on('close', () => resolve({ ok: res.statusCode < 400, code: res.statusCode, type: res.headers['content-type'], len: n }))
    })
    req.on('error', (e) => resolve({ ok: false, err: e.code || e.message }))
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, err: 'timeout' }) })
  })
}

async function main () {
  const search = await gdRequest({ types: 'search', source: 'netease', name: '屋顶', count: 1, pages: 1 })
  const song = search.body[0]
  const wyInfo = {
    songmid: song.url_id || song.id, id: song.id, name: song.name,
    singer: (song.artist || []).join('、'), albumName: song.album, albumId: song.pic_id,
    source: 'wy', interval: '04:00', _types: {},
  }
  const report = []
  for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.js'))) {
    const s = new LxScript(fs.readFileSync(path.join(DIR, f), 'utf8'), f)
    let url = ''
    try { await s.init(15000); url = await s.musicUrl('wy', wyInfo, '320k') } catch (e) { /* skip */ }
    if (typeof url !== 'string' || !/^https?:/.test(url)) { s.dispose(); continue }
    const r = await head(url)
    // 网易直链需要 referer 有时不需要，这里模拟浏览器
    report.push({ file: f, name: s.meta.name, url: url.slice(0, 120), ...r })
    console.log(f.padEnd(14), r.ok ? 'PLAYABLE' : 'DEAD', r.code || r.err, r.type || '', r.len || 0, url.slice(0, 80))
    s.dispose()
  }
  fs.writeFileSync(path.join(__dirname, '..', 'sources', 'url-report.json'), JSON.stringify(report, null, 2))
}
main().catch((e) => { console.error(e); process.exit(1) })
