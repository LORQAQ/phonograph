'use strict'
/* 精确修 B5 / B6 / B23（按实际代码格式） */
const fs = require('node:fs')

const sp = 'app/server.js'
let s = fs.readFileSync(sp, 'utf8')
const done = []

/* ---------- B6: loadDb 损坏时备份 ---------- */
const oldLoad = `function loadDb () {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) } catch (e) { return {} }
}`

const newLoad = `function loadDb () {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))
  } catch (e) {
    /* B6: 解析失败时备份损坏文件，避免用户数据无声消失 */
    try {
      if (fs.existsSync(DB_FILE)) {
        const bak = DB_FILE + '.bak'
        fs.copyFileSync(DB_FILE, bak)
        console.error('[db] 数据文件损坏，已备份到 ' + bak + '：' + e.message)
      }
    } catch (e2) { }
    return {}
  }
}`

if (s.includes(oldLoad)) {
  s = s.replace(oldLoad, newLoad)
  done.push('B6 loadDb 备份')
} else {
  console.log('B6 loadDb 仍未匹配')
}

/* ---------- B6: saveDb 原子写 ---------- */
const oldSave = `function saveDb () {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8') } catch (e) { console.warn('保存数据失败', e.message) }
  }, 300)
}`

const newSave = `function saveDb () {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try { writeDbNow() } catch (e) { console.warn('保存数据失败', e.message) }
  }, 300)
}

/* B6: 原子写 —— 先写 .tmp 再 rename，断电不会写坏原文件 */
function writeDbNow () {
  fs.mkdirSync(DATA, { recursive: true })
  const tmp = DB_FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8')
  fs.renameSync(tmp, DB_FILE)
}`

if (s.includes(oldSave)) {
  s = s.replace(oldSave, newSave)
  done.push('B6 saveDb 原子写')
} else {
  console.log('B6 saveDb 仍未匹配')
}

/* ---------- B5: shutdown 前同步落盘 ---------- */
const oldExit = `      setTimeout(() => process.exit(0), 150)`
const newExit = `      /* B5: 退出前同步写盘，避免最后一次修改丢失 */
      try {
        if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
        writeDbNow()
      } catch (e) { console.error('[db] 退出前保存失败', e.message) }
      setTimeout(() => process.exit(0), 300)`

if (s.includes(oldExit)) {
  s = s.replace(oldExit, newExit)
  done.push('B5 退出前落盘')
} else {
  const i = s.indexOf("'/api/shutdown'")
  if (i > 0) {
    const seg = s.slice(i, i + 600)
    console.log('shutdown 片段:')
    seg.split('\n').forEach((l) => { if (l.includes('exit') || l.includes('setTimeout')) console.log('  ' + l.trim()) })
  } else {
    console.log('B5 未找到 shutdown')
  }
}

/* ---------- B23: 歌单去重含平台 ---------- */
const dedupPatterns = [
  "pl.songs.some((s) => String(s.id) === String(song.id))",
  "pl.songs.some((s) => s.id === song.id)",
  "playlist.songs.some((s) => String(s.id) === String(song.id))",
]
let dedupFixed = false
for (const pat of dedupPatterns) {
  if (s.includes(pat)) {
    const repl = pat
      .replace('String(s.id) === String(song.id)', "String(s.id) === String(song.id) && (s.source || 'wy') === (song.source || 'wy')")
      .replace('s.id === song.id', "s.id === song.id && (s.source || 'wy') === (song.source || 'wy')")
    s = s.replace(pat, repl)
    done.push('B23 歌单去重含平台')
    dedupFixed = true
    break
  }
}
if (!dedupFixed) {
  /* 找 any .some((s) => ... id ...) */
  const m = s.match(/\.songs\.some\(\((\w+)\)\s*=>\s*[^)]*\.id[^)]*\)/)
  if (m) console.log('B23 候选: ' + m[0])
  else console.log('B23 未找到去重代码')
}

fs.writeFileSync(sp, s, 'utf8')
console.log('\n=== 本轮修复 ===')
done.forEach((d) => console.log('  ✓ ' + d))
