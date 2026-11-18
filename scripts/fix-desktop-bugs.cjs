'use strict'
/* 桌面端按 BUG-REPORT 修复 P0/P1 问题 */
const fs = require('node:fs')

const report = []

/* ============ 1. B5 + B6：db 原子写 + 退出前落盘 ============ */
const sp = 'app/server.js'
let s = fs.readFileSync(sp, 'utf8')

/* B6: 原子写 */
const oldSave = `function saveDb () {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2))
}`
const newSave = `function saveDb () {
  /* B6: 原子写 —— 先写临时文件再 rename，避免断电写坏 */
  try {
    const tmp = DB_FILE + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8')
    fs.renameSync(tmp, DB_FILE)
  } catch (e) {
    console.error('[db] 保存失败', e.message)
  }
}`

if (s.includes(oldSave)) {
  s = s.replace(oldSave, newSave)
  report.push('B6 db 原子写')
} else {
  console.log('B6 未匹配 saveDb')
}

/* B6: loadDb 解析失败备份 */
const oldLoad = `  } catch (e) {
    return { playlists: [{ id: 'default', name: '默认列表', songs: [] }], settings: {}, history: [], recent: [], downloads: [] }
  }`
const newLoad = `  } catch (e) {
    /* B6: 解析失败时把损坏文件备份，避免用户数据无声消失 */
    try {
      const bak = DB_FILE + '.bak'
      fs.copyFileSync(DB_FILE, bak)
      console.error('[db] 解析失败，已备份到 ' + bak + '：' + e.message)
    } catch (e2) { }
    return { playlists: [{ id: 'default', name: '默认列表', songs: [] }], settings: {}, history: [], recent: [], downloads: [] }
  }`

if (s.includes(oldLoad)) {
  s = s.replace(oldLoad, newLoad)
  report.push('B6 损坏 db 备份')
} else {
  console.log('B6 未匹配 loadDb')
}

/* B5: shutdown 前同步落盘 */
const oldShutdown = `      setTimeout(() => process.exit(0), 150)`
const newShutdown = `      /* B5: 退出前先同步写盘，避免最后修改丢失 */
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
      try { saveDb() } catch (e) { }
      setTimeout(() => process.exit(0), 300)`

if (s.includes(oldShutdown)) {
  s = s.replace(oldShutdown, newShutdown)
  report.push('B5 退出前落盘')
} else {
  console.log('B5 未匹配 shutdown')
}

/* B23: 歌单去重用 source|id */
const oldDedup = `      const exists = pl.songs.some((s) => String(s.id) === String(song.id))`
const newDedup = `      /* B23: 去重键加上平台，避免不同平台相同 id 误判 */
      const exists = pl.songs.some((s) => String(s.id) === String(song.id) && (s.source || 'wy') === (song.source || 'wy'))`

if (s.includes(oldDedup)) {
  s = s.replace(oldDedup, newDedup)
  report.push('B23 歌单去重含平台')
} else {
  const alt = s.indexOf('String(s.id) === String(song.id)')
  if (alt > 0) {
    const lineStart = s.lastIndexOf('\n', alt) + 1
    const lineEnd = s.indexOf('\n', alt)
    const line = s.slice(lineStart, lineEnd)
    if (!line.includes('source')) {
      s = s.slice(0, lineStart) + line.replace('String(s.id) === String(song.id)', "String(s.id) === String(song.id) && (s.source || 'wy') === (song.source || 'wy')") + s.slice(lineEnd)
      report.push('B23 歌单去重含平台（宽松）')
    }
  } else {
    console.log('B23 未匹配')
  }
}

/* B10: 删除文件时校验目录白名单 + 扩展名 */
const oldRemove = `  async '/api/downloads/remove' (req, q) {
    const name = q.get('name')
    if (!name) throw Object.assign(new Error('缺少文件名'), { code: 400 })
    const dir = db.settings.downloadDir || defaultDownloadDir()
    const full = path.join(dir, name)
    if (!full.startsWith(dir)) throw Object.assign(new Error('非法路径'), { code: 400 })
    try { fs.unlinkSync(full) } catch (e) { throw Object.assign(new Error('删除失败：' + e.message), { code: 500 }) }
    return { ok: true }
  },`

const newRemove = `  async '/api/downloads/remove' (req, q) {
    const name = q.get('name')
    if (!name) throw Object.assign(new Error('缺少文件名'), { code: 400 })
    /* B10: 只允许删音频扩展名，且必须属于扫描目录白名单 */
    if (!/\\.(mp3|flac|m4a|ogg|wav)$/i.test(name)) {
      throw Object.assign(new Error('只能删除音频文件'), { code: 400 })
    }
    if (name.includes('..') || name.includes('/') || name.includes('\\\\')) {
      throw Object.assign(new Error('非法文件名'), { code: 400 })
    }
    const candidates = [...new Set([
      db.settings.downloadDir,
      defaultDownloadDir(),
      path.join(ROOT, 'downloads'),
      q.get('dir') || '',
    ].filter(Boolean))]
    let removed = ''
    for (const d of candidates) {
      const full = path.join(d, name)
      /* 严格边界：用 path.relative 判断是否逃逸 */
      const rel = path.relative(d, full)
      if (rel.startsWith('..') || path.isAbsolute(rel)) continue
      if (!fs.existsSync(full)) continue
      try { fs.unlinkSync(full); removed = full } catch (e) { }
      if (removed) break
    }
    if (!removed) throw Object.assign(new Error('文件不存在或删除失败'), { code: 404 })
    return { ok: true, path: removed }
  },`

if (s.includes(oldRemove)) {
  s = s.replace(oldRemove, newRemove)
  report.push('B10 删除路径校验')
} else {
  console.log('B10 未匹配 remove')
}

/* S4: 静态目录用 path.relative 判断 */
const oldStatic = `  if (!full.startsWith(PUBLIC)) return json(res, 403, { error: '禁止访问' })`
const newStatic = `  /* S4: 用 path.relative 判断，避免 public2/ 这类兄弟前缀绕过 */
  const __rel = path.relative(PUBLIC, full)
  if (__rel.startsWith('..') || path.isAbsolute(__rel)) return json(res, 403, { error: '禁止访问' })`

if (s.includes(oldStatic)) {
  s = s.replace(oldStatic, newStatic)
  report.push('S4 静态路径边界')
} else {
  console.log('S4 未匹配静态')
}

/* S1: 默认绑定 127.0.0.1（可通过环境变量开放局域网） */
const oldListen = `server.listen(PORT, '0.0.0.0'`
const newListen = `/* S1: 默认只监听本机；要开局域网请设 PHONOGRAPH_LAN=1 */
server.listen(PORT, process.env.PHONOGRAPH_LAN === '1' ? '0.0.0.0' : '127.0.0.1'`

if (s.includes(oldListen)) {
  s = s.replace(oldListen, newListen)
  report.push('S1 默认绑定本机')
} else {
  const alt = s.indexOf("server.listen(PORT")
  if (alt > 0) {
    const end = s.indexOf(')', alt) + 1
    const seg = s.slice(alt, end)
    if (seg.includes('0.0.0.0')) {
      s = s.slice(0, alt) + "server.listen(PORT, process.env.PHONOGRAPH_LAN === '1' ? '0.0.0.0' : '127.0.0.1'" + s.slice(end)
      report.push('S1 默认绑定本机（宽松）')
    }
  }
}

fs.writeFileSync(sp, s, 'utf8')

/* ============ 2. B3 + B4 + B22：桌面端切歌 ============ */
const ap = 'public/app.js'
let a = fs.readFileSync(ap, 'utf8')

/* B3: streamSrc 之后校验 token */
const oldB3 = `  audio.src = await streamSrc(song, only)
  /* 残缺检测：metadata / durationchange / 轮询 */`
const newB3 = `  /* B3: 取流是异步的，回来时必须确认没有切到别的歌 */
  const __srcUrl = await streamSrc(song, only)
  if (token !== state.playToken) return
  /* B4: 空值不要赋给 audio.src（否则等于请求当前页面） */
  if (__srcUrl) {
    audio.src = __srcUrl
  } else {
    audio.removeAttribute('src')
    setSrc('解析失败')
  }
  /* 残缺检测：metadata / durationchange / 轮询 */`

if (a.includes(oldB3)) {
  a = a.replace(oldB3, newB3)
  report.push('B3 token 校验 + B4 空 src')
} else {
  console.log('B3/B4 未匹配')
}

/* B4 补充：streamSrc 内部也不返回空字符串 */
const oldInner = `  try {
    const d = await api('/api/url?' + qs)
    return (d && d.url) || ''
  } catch (e) {
    return ''
  }`
const newInner = `  try {
    const d = await api('/api/url?' + qs)
    return (d && d.url) || ''
  } catch (e) {
    return ''
  }`
/* 保持不变，由调用方判空 */

fs.writeFileSync(ap, a, 'utf8')

console.log('\n=== server.js ===')
report.filter((r) => /^B[0-9]|^S[0-9]/.test(r)).forEach((r) => console.log('  ' + r))
