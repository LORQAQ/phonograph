'use strict'
/* 给电脑端 app/lib/playlist-import.js 加 gcid 歌单支持
   （手机端已经有了，电脑端还只支持数字 specialid） */
process.chdir(require('node:path').resolve(__dirname, '..'))
const fs = require('node:fs')
const p = 'app/lib/playlist-import.js'
let s = fs.readFileSync(p, 'utf8')
const done = []
const miss = []

/* ---------- 1. detect 支持 gcid ---------- */
const detectOld = `  if (/kugou\\.com/.test(s)) {
    const m = /single\\/(\\d+)/.exec(s) || /specialid=(\\d+)/.exec(s) || /plist\\/list\\/(\\d+)/.exec(s)
    return m ? { platform: 'kg', id: m[1] } : null
  }`

const detectNew = `  if (/kugou\\.com/.test(s)) {
    /* 新版分享链接是 m.kugou.com/songlist/gcid_xxxx/，没有公开 API，只能解析页面首屏数据 */
    const g = /(gcid_[a-z0-9]+)/i.exec(s) || /songlist\\/([a-z0-9_]{8,})/i.exec(s)
    if (g) return { platform: 'kg', id: g[1] }
    const m = /single\\/(\\d+)/.exec(s) || /specialid=(\\d+)/.exec(s) || /plist\\/list\\/(\\d+)/.exec(s)
    return m ? { platform: 'kg', id: m[1] } : null
  }`

if (s.includes(detectOld)) {
  s = s.replace(detectOld, detectNew)
  done.push('detect 支持 gcid')
} else {
  miss.push('detect 酷狗分支')
}

/* ---------- 2. fromKugou 加 gcid 分支 ---------- */
const fromOld = `  fromKugou (specialid) {
    const api = require('./kugou.js')
    const { request } = require('./lx-engine.js')
    let name = '酷狗歌单'`

const fromNew = `  fromKugou (specialid) {
    const api = require('./kugou.js')
    const { request } = require('./lx-engine.js')
    let name = '酷狗歌单'

    /* gcid 歌单：m.kugou.com/songlist/gcid_xxx/ 是 React SPA，
       没有公开 API，但 HTML 里嵌了 window.$output 的首屏数据。
       用配平括号把 "songs":[...] 提出来。 */
    if (/^gcid_/i.test(String(specialid)) || /^[a-z0-9]{14,}$/i.test(String(specialid))) {
      const gid = String(specialid).startsWith('gcid_') ? String(specialid) : 'gcid_' + specialid
      const html = await new Promise((resolve, reject) => {
        request('https://m.kugou.com/songlist/' + gid + '/',
          { headers: api.HEADERS, insecure: true, timeout: 25000 },
          (e, r) => e ? reject(new Error('酷狗歌单页打不开: ' + e.message)) : resolve(String(r.body || '')))
      })

      /* 歌单名在 window.$output.info.listinfo.name */
      const li = /"listinfo"\\s*:\\s*\\{/.exec(html)
      if (li) {
        const seg = html.slice(li.index, li.index + 3000)
        const nm = /"name"\\s*:\\s*"([^"]{1,80})"/.exec(seg)
        if (nm) name = nm[1]
      }

      const idx = html.indexOf('"songs":[')
      if (idx < 0) throw new Error('这个酷狗歌单打不开（可能需要在 App 内打开）')

      /* 配平括号提取数组，注意字符串里的 [] 和转义 */
      let depth = 0
      let start = -1
      let inStr = false
      let esc = false
      let end = -1
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
          cover: x.cover,
        })
      }).filter(Boolean)

      if (!songs.length) throw new Error('酷狗歌单是空的')
      return { platform: 'kg', name: name, cover: '', songs }
    }`

if (s.includes(fromOld)) {
  s = s.replace(fromOld, fromNew)
  done.push('fromKugou 加 gcid 分支')
} else {
  miss.push('fromKugou 开头')
}

fs.writeFileSync(p, s, 'utf8')
console.log('=== 已完成 ===')
done.forEach((d) => console.log('  ✓ ' + d))
if (miss.length) {
  console.log('=== 未匹配 ===')
  miss.forEach((m) => console.log('  ⚠ ' + m))
}
