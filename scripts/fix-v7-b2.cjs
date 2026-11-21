'use strict'
/* B 批补齐：4 个未匹配项 + QUALITY_ORDER 去重（用行号定位，避免转义问题） */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

const done = []
const miss = []

function editLines (file, fn) {
  const lines = fs.readFileSync(file, 'utf8').split('\n')
  const before = lines.join('\n')
  fn(lines)
  const after = lines.join('\n')
  if (after !== before) { fs.writeFileSync(file, after, 'utf8'); return true }
  return false
}

/* ---------- 1. sources/toggle 校验 id ---------- */
{
  const ok = editLines('app/server.js', (L) => {
    const i = L.findIndex((l) => l.includes("const { id, enabled } = body || {}"))
    if (i < 0) return
    L.splice(i + 1, 0,
      '    /* P3: id 缺失时会把 undefined 塞进 disabledSources，落盘成 null 后永久脏数据 */',
      "    if (!id || typeof id !== 'string') throw Object.assign(new Error('缺少音源 id'), { code: 400 })",
      "    if (!sourceManager.entries.has(id)) throw Object.assign(new Error('音源不存在'), { code: 404 })")
  })
  ok ? done.push('sources/toggle 校验 id') : miss.push('sources/toggle')
}

/* ---------- 2. playlist remove 带 source ---------- */
{
  const ok = editLines('app/server.js', (L) => {
    const i = L.findIndex((l) => l.includes('p.songs = p.songs.filter((s) => s.id !== b.id)'))
    if (i < 0) return
    L[i] = "      /* P3: 只按 id 过滤会把其它平台同 id 的歌一起删掉（add 那边是带 source 判的） */\n" +
      '      if (p) { p.songs = p.songs.filter((s) => !(s.id === b.id && (s.source || \'wy\') === (b.source || \'wy\'))); saveDb() }'
    /* 原来整行是 `if (p) { p.songs = ...; saveDb() }`，替换后需要删掉重复的 if */
    const j = L.findIndex((l, k) => k > i && l.trim().startsWith('if (p) { p.songs = p.songs.filter'))
    if (j >= 0 && j !== i) {
      /* 上一行已经被替换成完整语句，删掉旧行 */
      L.splice(j, 1)
    }
  })
  ok ? done.push('playlist remove 带 source') : miss.push('playlist remove')
}

/* ---------- 3. 歌单 id 防撞 ---------- */
{
  const ok = editLines('app/server.js', (L) => {
    let n = 0
    for (let i = 0; i < L.length; i++) {
      if (L[i].includes("id: 'pl' + Date.now(),") || L[i].includes("const p = { id: 'pl' + Date.now(),")) {
        L[i] = L[i].replace(/'pl' \+ Date\.now\(\)/,
          "'pl' + Date.now() + '-' + require('node:crypto').randomBytes(3).toString('hex')")
        n++
      }
    }
    return n
  })
  ok ? done.push('歌单 id 防撞') : miss.push('歌单 id')
}

/* ---------- 4. parseMeta 边界 ---------- */
{
  const ok = editLines('app/lib/lx-engine.js', (L) => {
    const i = L.findIndex((l) => l.includes("new RegExp('@' + key + '\\\\s+([^\\\\r\\\\n*]+)')"))
    if (i < 0) return
    L[i] = L[i].replace("[^\\\\r\\\\n*]+", "[^\\\\r\\\\n*@]+")
    L.splice(i, 0, "      /* P3: 值里不能再吃 @ —— 否则一行写多个标签时 name 会吞掉整行 */")
  })
  ok ? done.push('parseMeta 边界') : miss.push('parseMeta')
}

/* ---------- 5. QUALITY_ORDER 函数内遮蔽 ---------- */
{
  const ok = editLines('app/lib/source-manager.js', (L) => {
    const i = L.findIndex((l, k) => k > 20 && l.includes("const QUALITY_ORDER = ['flac24bit'"))
    if (i < 0) return
    L[i] = '    /* P3: 用模块级常量，别在函数里再遮蔽一份（改一处漏一处的温床） */'
  })
  ok ? done.push('QUALITY_ORDER 去重') : miss.push('QUALITY_ORDER')
}

console.log('=== 补齐 ===')
done.forEach((d) => console.log('  ✓ ' + d))
if (miss.length) { console.log('未匹配:'); miss.forEach((m) => console.log('  ⚠ ' + m)) }