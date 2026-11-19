'use strict'
/* 修正锚点：实际是 `async function fromKugou (specialid) {` */
process.chdir(require('node:path').resolve(__dirname, '..'))
const fs = require('node:fs')
const p = 'app/lib/playlist-import.js'
let s = fs.readFileSync(p, 'utf8')

if (s.includes('gcid 歌单：m.kugou.com/songlist')) {
  console.log('gcid 分支已存在')
  process.exit(0)
}

const anchor = `async function fromKugou (specialid) {
  const api = require('./kugou.js')
  const { request } = require('./lx-engine.js')
  let name = '酷狗歌单'`

if (!s.includes(anchor)) {
  console.log('锚点仍未匹配')
  process.exit(1)
}

const gcidBlock = `async function fromKugou (specialid) {
  const api = require('./kugou.js')
  const { request } = require('./lx-engine.js')
  let name = '酷狗歌单'

  /* gcid 歌单：m.kugou.com/songlist/gcid_xxx/ 是 React SPA，没有公开 API，
     但 HTML 里嵌了 window.$output 的首屏数据。用配平括号提出 "songs":[...]。 */
  if (/^gcid_/i.test(String(specialid)) || /^[a-z0-9]{14,}$/i.test(String(specialid))) {
    const gid = String(specialid).startsWith('gcid_') ? String(specialid) : 'gcid_' + specialid
    const html = await new Promise((resolve, reject) => {
      request('https://m.kugou.com/songlist/' + gid + '/',
        { headers: api.HEADERS, insecure: true, timeout: 25000 },
        (e, r) => e ? reject(new Error('酷狗歌单页打不开: ' + e.message)) : resolve(String(r.body || '')))
    })

    const li = /"listinfo"\\s*:\\s*\\{/.exec(html)
    if (li) {
      const seg = html.slice(li.index, li.index + 3000)
      const nm = /"name"\\s*:\\s*"([^"]{1,80})"/.exec(seg)
      if (nm) name = nm[1]
    }

    const idx = html.indexOf('"songs":[')
    if (idx < 0) throw new Error('这个酷狗歌单打不开（可能需要在 App 内打开）')

    let depth = 0, start = -1, inStr = false, esc = false, end = -1
    for (let i = idx + 8; i < html.length; i++) {
      const ch = html[i]
      if (inStr) {
        if (esc) { esc = false; continue }
        if (ch === '\\\\') { esc = true; continue }
        if (ch === '"') inStr = false
        continue
      }
      if (ch === '"') { inStr = true; continue }
      if (ch === '[') { if (depth === 0) start = i; depth++ }
      else if (ch === ']') { depth--; if (depth === 0 && start >= 0) { end = i; break } }
    }
    if (start < 0 || end < 0) throw new Error('酷狗歌单数据解析失败')

    const arrStr = html.slice(start, end + 1).replace(/\\\\\\//g, '/')
    let raw = null
    try { raw = JSON.parse(arrStr) } catch (e) { throw new Error('酷狗歌单 JSON 解析失败: ' + e.message) }

    const songs = (raw || []).map((x) => {
      const nm = String(x.name || '').trim()
      const hash = String(x.hash || '')
      if (!hash || !nm) return null
      const parts = nm.split(' - ')
      return api.mapSong({
        songname: parts.length > 1 ? parts.slice(1).join(' - ') : nm,
        singername: parts.length > 1 ? parts[0].trim() : '未知歌手',
        hash: hash,
        album_id: x.album_id,
        duration: x.duration,
        trans_param: x.trans_param,
        feetype: x.feetype,
      })
    }).filter(Boolean)

    if (!songs.length) throw new Error('酷狗歌单是空的')
    return { platform: 'kg', name: name, cover: '', songs }
  }`

s = s.replace(anchor, gcidBlock)
fs.writeFileSync(p, s, 'utf8')
console.log('✓ fromKugou 已加 gcid 分支')
