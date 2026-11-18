'use strict'
/* 手机版 APK 全面校验 */
const fs = require('node:fs')
const path = require('node:path')
const { execSync } = require('node:child_process')

const apk = 'C:/Users/Administrator/Desktop/留声-1.0.1.apk'
if (!fs.existsSync(apk)) { console.log('APK 不存在'); process.exit(1) }

console.log('=== APK 基本信息 ===')
const b = fs.readFileSync(apk)
console.log('  大小      ' + (b.length / 1024).toFixed(0) + ' KB')
console.log('  ZIP 头    ' + (b[0] === 0x50 && b[1] === 0x4b))
console.log('  时间      ' + fs.statSync(apk).mtime.toLocaleString())

/* 提取 assets/www 内容校验 */
const { ZipArchive } = (() => { try { return { ZipArchive: null } } catch (e) { return { ZipArchive: null } } })()
const tmp = path.join(process.cwd(), 'build', '_apkcheck')
try { fs.rmSync(tmp, { recursive: true, force: true }) } catch (e) { }
fs.mkdirSync(tmp, { recursive: true })

try {
  execSync('tar.exe -xf "' + apk + '" -C "' + tmp + '" assets/www 2>nul', { stdio: 'pipe' })
} catch (e) {
  /* tar 对 apk 可能失败，用 unzip 兜底 */
  try { execSync('tar.exe -xf "' + apk + '" --wildcards "assets/www/*" -C "' + tmp + '"', { stdio: 'pipe' }) } catch (e2) { }
}

const www = path.join(tmp, 'assets', 'www')
console.log('\n=== APK 内 assets/www ===')
if (!fs.existsSync(www)) {
  console.log('  提取失败，改从源目录校验')
} else {
  const walk = (d, out) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p, out)
      else out.push({ path: path.relative(www, p).replace(/\\/g, '/'), size: fs.statSync(p).size })
    }
    return out
  }
  const files = walk(www, [])
  console.log('  文件数    ' + files.length)
  files.sort((a, b) => b.size - a.size).slice(0, 8).forEach((f) => {
    console.log('    ' + f.path.padEnd(34) + (f.size / 1024).toFixed(0) + ' KB')
  })
}

/* 从源目录校验内容 */
console.log('\n=== 关键功能校验（源目录）===')
const checks = [
  ['app.js 残缺检测', 'mobile/www/app.js', 'checkPreviewAndSwitch'],
  ['app.js 三重检测', 'mobile/www/app.js', '三重保险'],
  ['app.js 歌词滚动', 'mobile/www/app.js', 'function scrollPanelLyric'],
  ['app.js 高亮同步', 'mobile/www/app.js', '播放页歌词：同步高亮'],
  ['app.js 格式弹窗', 'mobile/www/app.js', 'function askDownloadFormat'],
  ['app.js m-deck', 'mobile/www/app.js', "classList.add('m-deck')"],
  ['app.js 歌单导入', 'mobile/www/app.js', 'preview'],
  ['引擎 fish 优先', 'mobile/www/lib/lx-engine-web.js', '先单独试 fish'],
  ['引擎 外链过滤', 'mobile/www/lib/lx-engine-web.js', 'song\\/media\\/outer'],
  ['引擎 硬超时', 'mobile/www/lib/lx-engine-web.js', '硬超时'],
  ['api 歌单导入', 'mobile/www/api-mobile.js', 'function importPlaylistMobile'],
  ['CSS 歌词放大', 'mobile/www/style.css', '歌词高亮放大'],
  ['CSS 顶栏两行', 'mobile/www/style.css', '手机端顶栏两行布局'],
  ['CSS 歌词区限高', 'mobile/www/style.css', '播放页歌词区限高'],
  ['CSS 歌词页修复', 'mobile/www/style.css', '歌词页显示修复'],
]

let ok = 0
for (const [name, file, key] of checks) {
  const s = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  const pass = s.includes(key)
  console.log('  ' + (pass ? '✓' : '✗') + ' ' + name)
  if (pass) ok++
}
console.log('\n通过 ' + ok + '/' + checks.length)

/* 音源清单 */
console.log('\n=== 内置音源 ===')
const sd = fs.readFileSync('mobile/www/sources-data.js', 'utf8')
const ids = [...sd.matchAll(/"id":"([^"]+)"/g)].map((m) => m[1])
console.log('  ' + ids.length + ' 个: ' + ids.join(', '))
console.log('  体积: ' + (sd.length / 1024).toFixed(0) + ' KB')

/* sources-data 是否真的在 APK 里 */
const inApk = fs.existsSync(path.join(www, 'sources-data.js'))
console.log('  APK 内含 sources-data.js: ' + inApk)
