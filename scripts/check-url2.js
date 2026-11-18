'use strict'
/* 音源播放地址真伪校验（跟随重定向，看最终 content-type）：node scripts/check-url2.js */
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const https = require('node:https')
const { LxScript } = require('../app/lib/lx-engine.js')
const { gdRequest } = require('../app/lib/gdstudio.js')

const DIR = path.join(__dirname, '..', 'sources', 'raw')
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

function probe (url, headers = {}, depth = 0) {
  return new Promise((resolve) => {
    let u
    try { u = new URL(url) } catch (e) { return resolve({ ok: false, err: 'bad url' }) }
    const lib = u.protocol === 'https:' ? https : http
    const req = lib.get(u, {
      headers: Object.assign({ 'User-Agent': UA, Accept: '*/*', Range: 'bytes=0-131072' }, headers),
      timeout: 15000,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && depth < 4) {
        res.resume()
        const next = new URL(res.headers.location, u).toString()
        return resolve(probe(next, headers, depth + 1))
      }
      const chunks = []
      let n = 0
      res.on('data', (c) => { chunks.push(c); n += c.length; if (n > 150000) req.destroy() })
      const done = () => resolve({
        ok: res.statusCode < 400,
        code: res.statusCode,
        type: res.headers['content-type'] || '',
        finalUrl: u.toString(),
        head: Buffer.concat(chunks).subarray(0, 8).toString('hex'),
        bytes: n,
      })
      res.on('end', done)
      res.on('close', done)
    })
    req.on('error', (e) => resolve({ ok: false, err: e.code || e.message }))
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, err: 'timeout' }) })
  })
}

async function main () {
  const only = process.argv[2]
  const search = await gdRequest({ types: 'search', source: 'netease', name: '屋顶', count: 1, pages: 1 })
  const song = search.body[0]
  const wyInfo = {
    songmid: song.url_id || song.id, id: song.id, name: song.name,
    singer: (song.artist || []).join('、'), albumName: song.album, albumId: song.pic_id,
    source: 'wy', interval: '04:00', _types: {},
  }
  const files = fs.readdirSync(DIR).filter((x) => x.endsWith('.js') && (!only || x.includes(only)))
  for (const f of files) {
    const s = new LxScript(fs.readFileSync(path.join(DIR, f), 'utf8'), f)
    let url = ''
    try {
      await s.init(12000)
      url = await s.musicUrl('wy', wyInfo, '320k')
    } catch (e) {
      console.log(f.padEnd(14), 'NOURL', e.message.slice(0, 80))
      s.dispose(); continue
    }
    if (typeof url !== 'string' || !/^https?:/.test(url)) { console.log(f.padEnd(14), 'NOURL', String(url).slice(0, 60)); s.dispose(); continue }
    const r = await probe(url)
    const audio = /audio|octet-stream|mpegurl/i.test(r.type || '') || /^494433|^fff|^ID3/i.test(r.head || '')
    console.log(f.padEnd(14), audio ? 'AUDIO_OK' : 'NOT_AUDIO', r.code || r.err, (r.type || '').slice(0, 24), r.bytes || 0, '|', (r.finalUrl || url).slice(0, 90))
    s.dispose()
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
