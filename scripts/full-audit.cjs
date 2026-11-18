'use strict'
/* 两端全面自检：语法 / 文件完整性 / 关键功能代码 */
const fs = require('node:fs')
const path = require('node:path')

const report = { pass: [], fail: [], warn: [] }
const P = (m) => report.pass.push(m)
const F = (m) => report.fail.push(m)
const W = (m) => report.warn.push(m)

function exists (p) { return fs.existsSync(p) }
function size (p) { try { return fs.statSync(p).size } catch (e) { return 0 } }
function read (p) { try { return fs.readFileSync(p, 'utf8') } catch (e) { return '' } }

/* ---------- 1. 电脑端文件 ---------- */
const pcFiles = [
  'app/server.js',
  'app/lib/source-manager.js',
  'app/lib/transcode.js',
  'app/lib/cross-platform.js',
  'app/lib/playlist-import.js',
  'app/lib/netease.js',
  'app/lib/qq.js',
  'app/lib/kugou.js',
  'app/lib/lx-engine.js',
  'public/index.html',
  'public/app.js',
  'public/style.css',
  '留声.exe',
  'LXMusic.ico',
  'Microsoft.Web.WebView2.Core.dll',
  'Microsoft.Web.WebView2.WinForms.dll',
  'runtime/node.exe',
  'runtime/bin/ffmpeg.exe',
]
for (const f of pcFiles) {
  if (exists(f)) P('PC 文件 ' + f + ' (' + (size(f) / 1024).toFixed(0) + ' KB)')
  else F('PC 缺失 ' + f)
}

/* ---------- 2. 音源 ---------- */
const srcDir = 'sources'
if (exists(srcDir)) {
  const js = fs.readdirSync(srcDir).filter((f) => f.endsWith('.js'))
  P('PC 音源 ' + js.length + ' 个: ' + js.map((x) => x.replace('.js', '')).join(','));
} else F('PC 缺失 sources/')

/* ---------- 3. 手机端文件 ---------- */
const mbFiles = [
  'mobile/www/index.html',
  'mobile/www/app.js',
  'mobile/www/style.css',
  'mobile/www/api-mobile.js',
  'mobile/www/sources-data.js',
  'mobile/www/lib/lx-engine-web.js',
  'mobile/www/lib/native-http.js',
  'mobile/www/lib/music-libs.js',
  'mobile/www/lib/vendor/crypto-js.min.js',
  'mobile/www/lib/vendor/pako.min.js',
  'mobile/www/lib/vendor/jsencrypt.min.js',
  'mobile/www/icon-192.png',
  'mobile/www/icon-512.png',
]
for (const f of mbFiles) {
  if (exists(f)) P('MB 文件 ' + f + ' (' + (size(f) / 1024).toFixed(0) + ' KB)')
  else F('MB 缺失 ' + f)
}

/* ---------- 4. 关键逻辑存在性 ---------- */
const checks = [
  ['PC server /api/url', read('app/server.js').includes("'/api/url'")],
  ['PC server /api/download', read('app/server.js').includes("'/api/download'")],
  ['PC server /api/download-dir', read('app/server.js').includes("'/api/download-dir'")],
  ['PC server /api/downloads', read('app/server.js').includes("'/api/downloads'")],
  ['PC server /api/playlist', read('app/server.js').includes("'/api/playlist'")],
  ['MB api /api/url', read('mobile/www/api-mobile.js').includes("'/api/url'")],
  ['MB api /api/playlist preview', read('mobile/www/api-mobile.js').includes("action === 'preview'")],
  ['MB api importPlaylistMobile', read('mobile/www/api-mobile.js').includes('function importPlaylistMobile')],
  ['MB 引擎 fish 优先', read('mobile/www/lib/lx-engine-web.js').includes('先单独试 fish')],
  ['MB 引擎 外链过滤', read('mobile/www/lib/lx-engine-web.js').includes('music\\.163\\.com\\/song\\/media\\/outer')],
  ['MB 引擎 硬超时', read('mobile/www/lib/lx-engine-web.js').includes('硬超时')],
  ['MB app 试听检测', read('mobile/www/app.js').includes('function checkPreviewAndSwitch')],
  ['MB app 三重检测', read('mobile/www/app.js').includes('三重保险')],
  ['MB app 歌词滚动', read('mobile/www/app.js').includes('function scrollPanelLyric')],
  ['MB app 歌词高亮同步', read('mobile/www/app.js').includes('播放页歌词：同步高亮')],
  ['MB app 格式选择弹窗', read('mobile/www/app.js').includes('function askDownloadFormat')],
  ['MB app 播放页 m-deck', read('mobile/www/app.js').includes("classList.add('m-deck')")],
  ['MB CSS 歌词高亮放大', read('mobile/www/style.css').includes('歌词高亮放大')],
  ['MB CSS 顶栏两行', read('mobile/www/style.css').includes('手机端顶栏两行布局')],
  ['MB CSS 播放页歌词区', read('mobile/www/style.css').includes('播放页歌词区限高')],
  ['MB 原生无问号按钮', !read('C:/Users/Administrator/Documents/deepseek-harness/default-workspace/apk-build/app/src/com/phonograph/player/MainActivity.java').includes('dot.setText("?")')],
]
for (const [name, ok] of checks) {
  if (ok) P('逻辑 ' + name)
  else F('逻辑缺失 ' + name)
}

/* ---------- 5. 语法检查 ---------- */
const { execSync } = require('node:child_process')
const synFiles = [
  'app/server.js', 'app/lib/source-manager.js', 'app/lib/transcode.js',
  'public/app.js',
  'mobile/www/app.js', 'mobile/www/api-mobile.js',
  'mobile/www/lib/lx-engine-web.js', 'mobile/www/lib/native-http.js', 'mobile/www/lib/music-libs.js',
]
for (const f of synFiles) {
  if (!exists(f)) continue
  try {
    execSync('"' + process.execPath + '" --check "' + f + '"', { stdio: 'pipe' })
    P('语法 ' + f)
  } catch (e) {
    F('语法错误 ' + f)
  }
}

/* ---------- 6. sources-data.js 音源数 ---------- */
const sd = read('mobile/www/sources-data.js')
const ids = [...sd.matchAll(/"id":"([^"]+)"/g)].map((m) => m[1])
P('MB 内置音源 ' + ids.length + ' 个: ' + ids.join(','))

/* ---------- 7. 坏调用扫描 ---------- */
for (const f of ['public/app.js', 'mobile/www/app.js']) {
  const s = read(f)
  const bad = []
  s.split('\n').forEach((l, i) => {
    if (/[^\$]\$\([^)]*\)\.forEach/.test(l)) bad.push('L' + (i + 1))
  })
  if (bad.length) F(f + ' 有 $().forEach 坏调用: ' + bad.join(','))
  else P(f + ' 无 $().forEach 坏调用')
}

/* ---------- 输出 ---------- */
console.log('='.repeat(60))
console.log('通过 ' + report.pass.length + ' 项 / 失败 ' + report.fail.length + ' 项 / 警告 ' + report.warn.length + ' 项')
console.log('='.repeat(60))
if (report.fail.length) {
  console.log('\n【失败】')
  report.fail.forEach((m) => console.log('  ✗ ' + m))
}
if (report.warn.length) {
  console.log('\n【警告】')
  report.warn.forEach((m) => console.log('  ! ' + m))
}
console.log('\n【通过】')
report.pass.forEach((m) => console.log('  ✓ ' + m))
