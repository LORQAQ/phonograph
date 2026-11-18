'use strict'
/* 组装 mobile/www：复制前端 + 打补丁（相对路径、引入数据层脚本） */
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const PUB = path.join(ROOT, 'public')
const WWW = path.join(ROOT, 'mobile', 'www')

fs.mkdirSync(path.join(WWW, 'lib'), { recursive: true })

// 1) 复制需要的静态文件
const files = ['style.css', 'app.js', 'LYRIC-TODO']
for (const f of files) {
  const src = path.join(PUB, f)
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(WWW, f))
}
for (const f of ['icon-192.png', 'icon-512.png']) {
  const src = path.join(PUB, f)
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(WWW, f))
}

// 2) index.html 打补丁
let html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8')
html = html.replace('<link rel="icon" href="/favicon.png" />', '')
html = html.replace('<link rel="manifest" href="/manifest.webmanifest" />', '')
html = html.replace(/<link rel="stylesheet" href="\/style\.css(\?[^"]*)?"\s*\/?>/, '<link rel="stylesheet" href="style.css$1" />')
html = html.replace(/<script src="\/app\.js(\?[^"]*)?"><\/script>/, '<script src="app.js$1"></script>')
html = html.replace(/(<script src="app\.js(\?[^"]*)?"><\/script>)/,
  [
    '<script src="lib/vendor/crypto-js.min.js"></script>',
    '<script src="lib/vendor/pako.min.js"></script>',
    '<script src="lib/vendor/jsencrypt.min.js"></script>',
    '<script src="lib/native-http.js"></script>',
    '<script src="lib/lx-engine-web.js"></script>',
    '<script src="sources-data.js"></script>',
    '<script src="lib/music-libs.js"></script>',
    '<script src="api-mobile.js"></script>',
    '$1',
  ].join('\n'))
// 去掉移动端 service worker 注册（file:// 下不可用）
html = html.replace(/<script>\s*if \('serviceWorker'[\s\S]*?<\/script>/, '')

fs.writeFileSync(path.join(WWW, 'index.html'), html, 'utf8')

// 3) app.js 里移动端特判：禁止再用绝对 /api/ 图片路径（file:// 下会失败）
let app = fs.readFileSync(path.join(WWW, 'app.js'), 'utf8')
app = app.replace(
  "return '/api/pic?source=' + (song.source || 'wy') + '&id=' + encodeURIComponent(song.id)",
  "return window.__MOBILE__ ? '' : '/api/pic?source=' + (song.source || 'wy') + '&id=' + encodeURIComponent(song.id)"
)
// 跟随封面取色：手机端跳过（file:// 下无法访问 /api/pic）
app = app.replace(
  "img.src = '/api/pic?' + q",
  "if (window.__MOBILE__) return\n  img.src = '/api/pic?' + q"
)
// 重载当前曲目：手机端走直链解析
app = app.replace(
  "function reloadCurrent () {\n  if (!state.currentSong) return\n  const t = audio.currentTime\n  audio.src = '/api/stream?' + songParams(state.currentSong).toString()",
  "async function reloadCurrent () {\n  if (!state.currentSong) return\n  const t = audio.currentTime\n  audio.src = await streamSrc(state.currentSong)"
)
fs.writeFileSync(path.join(WWW, 'app.js'), app, 'utf8')

const list = fs.readdirSync(WWW, { recursive: true }).filter((f) => fs.statSync(path.join(WWW, f)).isFile())
console.log('mobile/www 组装完成：', list.length, '个文件')
for (const f of list) console.log('  ', f, Math.round(fs.statSync(path.join(WWW, f)).size / 1024) + 'KB')
