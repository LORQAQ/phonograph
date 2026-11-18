'use strict'
/* 1) 修复损坏的 db.json：保留歌单，重置可疑设置 */
const fs = require('node:fs')
const path = require('node:path')
const DB = 'data/db.json'

let raw = ''
try { raw = fs.readFileSync(DB, 'utf8') } catch (e) { raw = '' }

let db = null
try {
  db = JSON.parse(raw)
  console.log('db.json 正常')
} catch (e) {
  console.log('db.json 损坏，尝试修复:', e.message)
  /* 逐段裁剪非法控制字符后再解析 */
  const cleaned = raw.replace(/[\u0000-\u001f]+/g, ' ')
  try {
    db = JSON.parse(cleaned)
    console.log('清洗后可解析')
  } catch (e2) {
    db = { playlists: [], settings: {}, recent: [] }
    console.log('无法修复，重建基础结构')
  }
}

if (db && db.settings) {
  delete db.settings.downloadDir   /* 去掉可能的乱码路径 */
}

if (db) {
  try {
    fs.mkdirSync('data', { recursive: true })
    fs.writeFileSync(DB, JSON.stringify(db, null, 2), 'utf8')
    console.log('已写回，设置项:', Object.keys(db.settings || {}).join(','))
  } catch (e) { console.log('写回失败', e.message) }
}

/* 2) server.js：下载目录健壮化——设置值不可用就回落到默认 */
let s = fs.readFileSync('app/server.js', 'utf8')

const oldDir = "      const dir = db.settings.downloadDir || defaultDownloadDir()"
const newDir = `      const wantDir = db.settings.downloadDir
      let dir = defaultDownloadDir()
      if (wantDir && !/[\\uFFFD]/.test(wantDir)) {
        try { fs.mkdirSync(wantDir, { recursive: true }); dir = wantDir } catch (e) { dir = defaultDownloadDir() }
      }`
if (s.includes(oldDir)) {
  s = s.replace(oldDir, newDir)
}

/* 默认目录用 Unicode 转义，避免任何编码歧义 */
s = s.replace(
  "return require('node:path').join(home, 'Music', '留声')",
  "return require('node:path').join(home, 'Music', '\\u7559\\u58f0')"
)

fs.writeFileSync('app/server.js', s, 'utf8')
console.log('下载目录健壮化:', s.includes('wantDir'))
console.log('默认目录转义:', s.includes('\\u7559\\u58f0'))
