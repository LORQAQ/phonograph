'use strict'
/* Audit fixture: drive kugou-gcid.js paging/dedupe/ratelimit logic with canned responses.
   Payload field shapes copied from the REAL m.kugou.com $output songs[] object. */
const https = require('node:https')
const http = require('node:http')
const { EventEmitter } = require('node:events')

function fakeResponse (statusCode, body) {
  const res = new EventEmitter()
  res.statusCode = statusCode
  res.headers = { 'content-type': 'application/json' }
  setTimeout(() => {
    res.emit('data', Buffer.from(body, 'utf8'))
    res.emit('end')
  }, 0)
  return res
}

function fakeRequest (handler) {
  return function (opts, cb) {
    const req = new EventEmitter()
    req.write = () => {}
    req.end = () => {
      const url = 'http://' + (opts.hostname || opts.host) + (opts.path || '')
      let out
      try { out = handler(url, opts) } catch (e) { out = { status: 500, body: '{}' } }
      if (out && out.netError) { setImmediate(() => req.emit('error', new Error(out.netError))); return }
      if (out && out.hang) return
      setImmediate(() => {
        const res = fakeResponse(out.status || 200, out.body)
        cb(res)
      })
    }
    req.destroy = () => {}
    req.setTimeout = () => {}
    return req
  }
}

const kg = require('../app/lib/kugou-gcid.js')

const mkSong = (i, opt = {}) => ({
  hash: opt.dupOf !== undefined ? 'HASH' + opt.dupOf : 'HASH' + i,
  name: 'SINGER' + i + ' - Song' + i,
  remark: opt.remark,
  singerinfo: [{ name: 'SINGER' + i }],
  timelen: 200000,
  album_id: '100',
  feetype: 0,
  cover: 'http://imge.kugou.com/stdmusic/{size}/x.jpg',
  trans_param: {},
})

const gcidOk = (gid, info) => JSON.stringify({ status: 1, err_code: 0, data: { list: [{ global_collection_id: gid, info: info || {} }] } })

let scenario = null
let calls = []

function handler (url) {
  if (url.includes('t.kugou.com/v1/songlist/batch_decode')) {
    calls.push('decode')
    return { body: gcidOk('collection_3_999_1', { title: 'X' }) }
  }
  if (url.includes('/special/info_v2')) {
    calls.push('info')
    return { body: JSON.stringify({ status: 1, errcode: 0, data: { specialname: scenario.name || 'TestList', songcount: scenario.infoCount !== undefined ? scenario.infoCount : scenario.total, imgurl: 'http://x/{size}.jpg' } }) }
  }
  if (url.includes('/special/song_v2')) {
    const page = Number(/[?&]page=(\d+)/.exec(url)[1])
    const ps = Number(/[?&]pagesize=(\d+)/.exec(url)[1])
    calls.push('song_v2#' + page)
    if (scenario.songv2 === 'limit') return { body: JSON.stringify({ status: 0, errcode: 20028, error: 'limit' }) }
    if (scenario.songv2 === 'limitAfter' && page > (scenario.afterPage || 1)) return { body: JSON.stringify({ status: 0, errcode: 20028, error: 'limit' }) }
    const eff = Math.min(ps, scenario.cap || ps)
    const start = (page - 1) * eff
    const n = Math.max(0, Math.min(eff, scenario.total - start))
    const list = []
    for (let i = start; i < start + n; i++) list.push(mkSong(i, scenario.dup ? { dupOf: 0 } : {}))
    return { body: JSON.stringify({ status: 1, errcode: 0, data: { total: scenario.total, info: list } }) }
  }
  if (url.includes('get_other_list_file')) {
    const page = Number(/[?&]page=(\d+)/.exec(url)[1])
    const ps = Number(/[?&]pagesize=(\d+)/.exec(url)[1])
    calls.push('alt#' + page)
    const eff = Math.min(ps, 300)
    const start = (page - 1) * eff
    const n = Math.max(0, Math.min(eff, scenario.total - start))
    const list = []
    for (let i = start; i < start + n; i++) list.push(mkSong(i))
    return { body: JSON.stringify({ status: 1, error_code: 0, data: { count: scenario.total, info: list } }) }
  }
  return { status: 404, body: '{}' }
}

https.request = fakeRequest(handler)
http.request = fakeRequest(handler)

async function run (title, sc) {
  scenario = sc
  calls = []
  const t = Date.now()
  let line
  try {
    const r = await kg.fetchGcidPlaylist('gcid_3xnx57dpz2tz0b7', { maxSongs: sc.maxSongs || 2000 })
    const ok = r.songs.length === sc.expect
    line = '  songs=' + r.songs.length + ' total=' + r.total + ' truncated=' + r.truncated +
      ' ms=' + (Date.now() - t) + ' | expected=' + sc.expect + (ok ? '  OK' : '  MISMATCH')
  } catch (e) {
    line = '  THROW: ' + e.message + ' (code=' + e.code + ', ms=' + (Date.now() - t) + ')'
  }
  console.log('\n### ' + title + '\n' + line + '\n  calls=' + calls.join(','))
}

;(async () => {
  await run('S1 plain 800 songs, 300/page', { total: 800, expect: 800 })
  await run('S2 upstream clamps pagesize to 250', { total: 800, cap: 250, expect: 800 })
  await run('S3 song_v2 20028 on page1 -> alt', { total: 800, songv2: 'limit', expect: 800 })
  await run('S4 song_v2 20028 from page2', { total: 800, songv2: 'limitAfter', afterPage: 1, expect: 800 })
  await run('S5 every entry same hash (dup in list)', { total: 300, dup: true, expect: 1 })
  await run('S6 maxSongs=200 cap', { total: 800, maxSongs: 200, expect: 200 })
  await run('S7 info_v2 songcount=3 but real 800', { total: 800, infoCount: 3, expect: 800 })
  await run('S8 info_v2 fails? simulate count=0', { total: 800, infoCount: 0, expect: 800 })
})()
