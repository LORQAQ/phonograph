'use strict'
/* 把 app/lib 的音乐接口模块打包成浏览器可用的单文件 mobile/www/lib/music-libs.js */
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const OUT_DIR = path.join(ROOT, 'mobile', 'www', 'lib')
fs.mkdirSync(OUT_DIR, { recursive: true })

function strip (file, exportName) {
  let s = fs.readFileSync(path.join(ROOT, 'app', 'lib', file), 'utf8')
  // 去掉 'use strict' 与 require
  s = s.replace(/^'use strict'\s*/m, '')
  s = s.replace(/const \{ request \} = require\('\.\/lx-engine\.js'\)\s*/g, 'const request = __REQ__\n')
  s = s.replace(/const \{[^}]*\} = require\('\.\/lx-engine\.js'\)\s*/g, 'const request = function (u, o, c) { return globalThis.__REQ__(u, o, c) }\n')
  const modMap = { netease: 'NET_WY', qq: 'NET_TX', kugou: 'NET_KG' }
  s = s.replace(/const (\w+) = require\('\.\/(netease|qq|kugou)\.js'\)/g, (m, name, mod) => `const ${name} = globalThis.${modMap[mod]}`)
  s = s.replace(/const \{([^}]*)\} = require\('\.\/(netease|qq|kugou)\.js'\)/g, (m, names, mod) => `const {${names}} = globalThis.${modMap[mod]}`)
  // module.exports -> 全局
  s = s.replace(/module\.exports\s*=\s*\{[^}]*\}/, `window.${exportName} = { search, toplist, lyric, pic, mapSong, recommendPlaylists, HEADERS }`.replace('lyric, pic', 'lyric, pic'))
  return s
}

// 每个模块导出不同名字，用 IIFE 隔离作用域避免 const 冲突
function transform (file, exportName, exportsLine) {
  let s = fs.readFileSync(path.join(ROOT, 'app', 'lib', file), 'utf8')
  s = s.replace(/^'use strict'\s*/m, '')
  s = s.replace(/const \{[^}]*\} = require\('\.\/lx-engine\.js'\)\s*/g, 'const request = function (u, o, c) { return globalThis.__REQ__(u, o, c) }\n')
  const modMap = { netease: 'NET_WY', qq: 'NET_TX', kugou: 'NET_KG' }
  s = s.replace(/const (\w+) = require\('\.\/(netease|qq|kugou)\.js'\)/g, (m, name, mod) => `const ${name} = globalThis.${modMap[mod]}`)
  s = s.replace(/const \{([^}]*)\} = require\('\.\/(netease|qq|kugou)\.js'\)/g, (m, names, mod) => `const {${names}} = globalThis.${modMap[mod]}`)
  s = s.replace(/module\.exports\s*=\s*\{[\s\S]*?\}\s*$/m, exportsLine)
  return ';(function () {\nconst __REQ__ = globalThis.__REQ__\n' + s + '\n})();\n'
}

const header = `/* 由 scripts/build-mobile-www.js 生成 · 音乐接口层（浏览器/Node 通用）
 * 依赖全局 __REQ__(url, opts, cb) 提供 HTTP 请求
 */
(function () {
  const __REQ__ = (typeof globalThis.__REQ__ === 'function')
    ? globalThis.__REQ__
    : function (url, opts, cb) { cb(new Error('未注入 __REQ__')) }
`

const netease = transform('netease.js', 'NET_WY', 'globalThis.NET_WY = { search, detail, lyric, pic, mapSong, fmtDuration, api, toplist, TOPLISTS, recommendPlaylists, newSongs, HEADERS }')
const qq = transform('qq.js', 'NET_TX', 'globalThis.NET_TX = { search, detail, lyric, pic, toplist, mapSong, HEADERS, recommendPlaylists }')
const kugou = transform('kugou.js', 'NET_KG', 'globalThis.NET_KG = { search, lyric, pic, toplist, mapSong, HEADERS, RANKS, recommendPlaylists }')
const importer = transform('playlist-import.js', 'NET_IMPORT', 'globalThis.NET_IMPORT = { detect, importPlaylist }')

const out = header + '\n' + netease + '\n' + qq + '\n' + kugou + '\n' + importer + '\n})()\n'
fs.writeFileSync(path.join(OUT_DIR, 'music-libs.js'), out, 'utf8')
console.log('生成 mobile/www/lib/music-libs.js:', Math.round(out.length / 1024), 'KB')
