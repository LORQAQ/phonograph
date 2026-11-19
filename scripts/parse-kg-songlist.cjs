'use strict'
/* 从酷狗 songlist HTML 里解析 songs 数组（React SPA 首屏数据） */
const https = require('node:https')
const fs = require('node:fs')

function get (url) {
  return new Promise((resolve) => {
    const u = new URL(url)
    const q = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36',
        Referer: 'https://m.kugou.com/',
      },
      timeout: 20000,
      rejectUnauthorized: false,
    }, (res) => {
      let d = ''
      res.on('data', (c) => { d += c })
      res.on('end', () => resolve(d))
    })
    q.on('error', () => resolve(''))
    q.end()
  })
}

/* 从 from 位置开始，找到配平的 JSON 数组 */
function extractArray (s, from) {
  let depth = 0
  let start = -1
  let inStr = false
  let esc = false
  for (let i = from; i < s.length; i++) {
    const c = s[i]
    if (inStr) {
      if (esc) { esc = false; continue }
      if (c === '\\') { esc = true; continue }
      if (c === '"') inStr = false
      continue
    }
    if (c === '"') { inStr = true; continue }
    if (c === '[') { if (depth === 0) start = i; depth++ }
    else if (c === ']') { depth--; if (depth === 0 && start >= 0) return s.slice(start, i + 1) }
  }
  return ''
}

;(async () => {
  const gcid = '3znx57dpz2tz0b7'
  const html = await get('https://m.kugou.com/songlist/gcid_' + gcid + '/')
  console.log('HTML 长度: ' + html.length)

  /* 找 "songs":[ */
  const idx = html.indexOf('"songs":[')
  console.log('"songs":[ 位置: ' + idx)
  if (idx < 0) { console.log('未找到'); return }

  const arrStr = extractArray(html, idx + 8)
  console.log('数组长度: ' + arrStr.length)

  let songs = null
  try {
    /* HTML 里的转义：\\/ → / */
    songs = JSON.parse(arrStr.replace(/\\\//g, '/'))
  } catch (e) {
    console.log('解析失败: ' + e.message)
    console.log('前 300: ' + arrStr.slice(0, 300))
    return
  }

  console.log('\n✓ 解析成功，共 ' + songs.length + ' 首\n')
  songs.slice(0, 5).forEach((s, i) => {
    console.log((i + 1) + '. ' + (s.name || '').slice(0, 40))
    console.log('   hash=' + s.hash + ' albumId=' + s.album_id + ' ' + (s.duration || '?') + 's')
    console.log('   cover=' + String(s.cover || '').slice(0, 70))
    console.log('   priv=' + s.privilege + ' feetype=' + s.feetype)
  })

  /* 找歌单名 */
  const nm = /"specialname"\s*:\s*"([^"]{1,80})"/.exec(html) || /"name"\s*:\s*"([^"]{1,80})"\s*,\s*"pic"/.exec(html)
  console.log('\n歌单名: ' + (nm ? nm[1] : '未找到'))

  fs.writeFileSync('build/_kg_parsed.json', JSON.stringify(songs.slice(0, 5), null, 2))
  console.log('\n已保存 build/_kg_parsed.json')
})()
