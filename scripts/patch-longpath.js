'use strict'
/* Windows 下中文路径需要 \\?\ 前缀，否则 Node 会按 ANSI 转换导致路径乱码 */
const fs = require('node:fs')
const p = 'app/server.js'
let s = fs.readFileSync(p, 'utf8')

/* 1) mkdir 用长路径前缀 */
s = s.replace(
  "        try { fs.mkdirSync(wantDir, { recursive: true }); dir = wantDir } catch (e) { dir = defaultDownloadDir() }",
  "        try { fs.mkdirSync(longPath(wantDir), { recursive: true }); dir = wantDir } catch (e) { dir = defaultDownloadDir() }"
)
s = s.replace(
  "      try { fs.mkdirSync(dir, { recursive: true }) } catch (e) { }",
  "      try { fs.mkdirSync(longPath(dir), { recursive: true }) } catch (e) { }"
)

/* 2) 写文件也用长路径前缀 */
s = s.replace(
  "      const full = pathMod.join(dir, filename)\n      const tmp = full + '.part'",
  "      const full = pathMod.join(dir, filename)\n      const tmp = longPath(full + '.part')\n      const fullLong = longPath(full)"
)
s = s.replace(
  "        fs.renameSync(tmp, full)",
  "        fs.renameSync(tmp, fullLong)"
)
s = s.replace(
  "        return json(res, 200, { ok: true, path: full, size: st.size, name: filename })",
  "        return json(res, 200, { ok: true, path: full, size: st.size, name: filename })"
)

/* 3) 加 longPath 工具 */
if (!s.includes('function longPath')) {
  s = s.replace(
    'function defaultDownloadDir () {',
    `/* Windows 中文路径：加 \\\\?\\ 前缀让 Node 走 UTF-16 API */
function longPath (p2) {
  if (process.platform !== 'win32') return p2
  const abs = require('node:path').resolve(p2)
  return abs.startsWith('\\\\\\\\?\\\\') ? abs : '\\\\\\\\?\\\\' + abs
}

function defaultDownloadDir () {`
  )
}

fs.writeFileSync(p, s, 'utf8')
console.log('longPath 已加:', s.includes('function longPath'))
console.log('mkdir 用 longPath:', s.includes('fs.mkdirSync(longPath(dir)'))
console.log('写文件用 longPath:', s.includes('const tmp = longPath('))
