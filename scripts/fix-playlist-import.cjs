'use strict'
/* 修歌单导入：
   1) parsePlaylistUrl 支持 QQ 的 ?id= 和酷狗的 gcid_
   2) 酷狗 gcid 从 songlist HTML 里解析 songs 数组
   改的是 public/app.js（源头），assemble 会复制到 mobile/www */
const fs = require('node:fs')

/* ============ 1. 手机端 api-mobile.js ============ */
const ap = 'mobile/www/api-mobile.js'
let a = fs.readFileSync(ap, 'utf8')
const done = []

/* --- parsePlaylistUrl --- */
const oldParse = `  function parsePlaylistUrl (raw) {
    const u = String(raw || '').trim()
    if (!u) return null
    /* 网易云 */
    let m = u.match(/music\\.163\\.com[^#]*[#/]playlist\\?[^#]*id=(\\d+)/) || u.match(/[?&]id=(\\d+)/)
    if (/music\\.163\\.com/.test(u) && m) return { platform: 'wy', id: m[1] }
    /* QQ 音乐 */
    m = u.match(/y\\.qq\\.com[^#]*playlist\\/(\\d+)/) || u.match(/playlist\\/(\\d+)/)
    if (/qq\\.com/.test(u) && m) return { platform: 'tx', id: m[1] }
    /* 酷狗 */
    m = u.match(/kugou\\.com[^#]*special\\/single\\/(\\d+)/) || u.match(/special\\/single\\/(\\d+)/)
    if (/kugou\\.com/.test(u) && m) return { platform: 'kg', id: m[1] }
    return null
  }`

const newParse = `  function parsePlaylistUrl (raw) {
    const u = String(raw || '').trim()
    if (!u) return null
    /* 网易云 */
    let m = u.match(/music\\.163\\.com[^#]*[#/]playlist\\?[^#]*id=(\\d+)/) || u.match(/[?&]id=(\\d+)/)
    if (/music\\.163\\.com/.test(u) && m) return { platform: 'wy', id: m[1] }
    /* QQ 音乐：支持三种写法
       y.qq.com/n/ryqq/playlist/123
       y.qq.com/.../playlist.html?...&id=123
       i2.y.qq.com/n3/other/pages/details/playlist.html?...&id=123      */
    if (/qq\\.com/.test(u)) {
      m = u.match(/playlist\\/(\\d+)/) ||
          u.match(/[?&](?:id|disstid)=(\\d+)/) ||
          u.match(/playlist\\.html[^#]*[?&]id=(\\d+)/)
      if (m) return { platform: 'tx', id: m[1] }
    }
    /* 酷狗：两种写法
       kugou.com/yy/special/single/123.html        （数字 id）
       m.kugou.com/songlist/gcid_xxxx/             （gcid）  */
    if (/kugou\\.com/.test(u)) {
      m = u.match(/special\\/single\\/(\\d+)/)
      if (m) return { platform: 'kg', id: m[1] }
      m = u.match(/(gcid_[a-z0-9]+)/i)
      if (m) return { platform: 'kg', id: m[1] }
      m = u.match(/songlist\\/([a-z0-9_]+)/i)
      if (m) return { platform: 'kg', id: m[1] }
    }
    return null
  }`

if (a.includes(oldParse)) {
  a = a.replace(oldParse, newParse)
  done.push('parsePlaylistUrl 支持新链接')
} else {
  console.log('⚠ parsePlaylistUrl 未匹配')
}

/* --- kg 分支：gcid 时走 HTML 解析 --- */
const MARK = '/* gcid 走 HTML 解析 */'
if (!a.includes(MARK)) {
  /* 在 kg 分支开头插入 gcid 判断 */
  const anchor = `    if (platform === 'kg') {`
  if (a.includes(anchor)) {
    const inject = `    if (platform === 'kg') {
      ${MARK}
      /* gcid_ 开头的歌单没有公开 API，只能从 songlist 页面的首屏数据里解析 */
      if (/^gcid_/i.test(id) || /^[a-z0-9]{14,}$/i.test(id)) {
        const html = await nativeHttp('https://m.kugou.com/songlist/' + (String(id).startsWith('gcid_') ? id : 'gcid_' + id) + '/', {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36',
            Referer: 'https://m.kugou.com/',
          },
          insecure: true,
        })
        const text = String(html.body || '')
        const nameM = /"specialname"\\s*:\\s*"([^"]{1,80})"/.exec(text)
        const idx = text.indexOf('"songs":[')
        if (idx < 0) throw new Error('这个酷狗歌单打不开（可能需要 App 内打开）')
        /* 配平括号提取数组 */
        let depth = 0; let start = -1; let inStr = false; let esc = false; let end = -1
        for (let i = idx + 8; i < text.length; i++) {
          const ch = text[i]
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
        const arrStr = text.slice(start, end + 1).replace(/\\\\\\//g, '/')
        let raw = null
        try { raw = JSON.parse(arrStr) } catch (e) { throw new Error('酷狗歌单 JSON 解析失败') }
        const songs = (raw || []).map((x) => {
          const nm = String(x.name || '').trim()
          const parts = nm.split(' - ')
          const hash = String(x.hash || '')
          if (!hash || !nm) return null
          return {
            id: hash,
            source: 'kg',
            name: parts.length > 1 ? parts.slice(1).join(' - ') : nm,
            singer: parts.length > 1 ? parts[0] : '',
            album: (x.albuuminfo && x.albuuminfo.name) || '',
            albumId: String(x.album_id || ''),
            durationText: msToText(Number(x.duration || 0) * 1000),
            cover: String(x.cover || '').replace('{size}', '300'),
          }
        }).filter(Boolean)
        if (!songs.length) throw new Error('酷狗歌单是空的')
        return { platform: 'kg', name: nameM ? nameM[1] : '酷狗歌单', songs, skipped: 0 }
      }`
    a = a.replace(anchor, inject)
    done.push('kg gcid 走 HTML 解析')
  } else {
    console.log('⚠ kg 分支未找到')
  }
}

fs.writeFileSync(ap, a, 'utf8')
console.log('\n=== api-mobile.js ===')
done.forEach((d) => console.log('  ✓ ' + d))
