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

/* P1: index.html 的替换原来全是裸 replace，锚点一变就是 no-op，
         产物仍是 <script src="/app.js"> 且不注入 8 个必需脚本 —— 白屏包，而旧验证全绿。 */
    function assertHtml (h) {
      const errs = []
      if (/src="\/app\.js/.test(h)) errs.push('app.js 还是绝对路径')
      if (/href="\/style\.css/.test(h)) errs.push('style.css 还是绝对路径')
      const need = ['api-mobile.js', 'sources-data.js', 'lib/lx-engine-web.js', 'lib/native-http.js', 'lib/music-libs.js']
      for (const n of need) {
        if (!h.includes('src="' + n + '"')) errs.push('没注入 ' + n)
      }
      if (errs.length) {
        throw new Error('index.html 组装失败：\n  - ' + errs.join('\n  - '))
      }
    }
    assertHtml(html)
    fs.writeFileSync(path.join(WWW, 'index.html'), html, 'utf8')

// 3) app.js 里移动端特判：禁止再用绝对 /api/ 图片路径（file:// 下会失败）
//
// B26: 补丁必须命中。失配说明 public/app.js 的结构变了，必须同步更新本脚本，
//      否则会静默 no-op，改了半天发现跑的是旧逻辑（已经踩过两次）。
function mustReplace (src, from, to, name) {
  if (!src.includes(from)) {
    throw new Error(
      '补丁锚点丢失（public/app.js 已改动，请更新 scripts/assemble-mobile-www.js）：' + name +
      '\n  期望找到：' + JSON.stringify(String(from).slice(0, 90))
    )
  }
  return src.replace(from, to)
}

let app = fs.readFileSync(path.join(WWW, 'app.js'), 'utf8')

// 3.1 封面 URL 在手机端不再走 /api/pic 绝对路径
app = mustReplace(
  app,
  "return '/api/pic?source=' + (song.source || 'wy') + '&id=' + encodeURIComponent(song.id)",
  "return window.__MOBILE__ ? '' : '/api/pic?source=' + (song.source || 'wy') + '&id=' + encodeURIComponent(song.id)",
  '封面 /api/pic 绝对路径'
)

// 3.2 跟随封面取色在手机端跳过（file:// 下无法访问 /api/pic）
app = mustReplace(
  app,
  "img.src = '/api/pic?' + q",
  "if (window.__MOBILE__) return\n  img.src = '/api/pic?' + q",
  '封面取色跳过'
)

// 3.3 reloadCurrent 的移动端特判已经不需要了：
//     public/app.js 里的 reloadCurrent 现在本身就是 `async` + `await streamSrc(...)`，
//     两端共用同一份实现。这里保留断言，确保它没被改回同步 + /api/stream 的老写法。
//     注意函数现在带参数（prevQualityArg），所以不能要求空括号。
if (!/async function reloadCurrent\s*\(/.test(app)) {
  throw new Error('reloadCurrent 不再是 async（手机端会走 /api/stream 绝对路径而失败）')
}
if (!/await streamSrc\(state\.currentSong/.test(app)) {
  throw new Error('reloadCurrent 里没有 await streamSrc(state.currentSong...)（手机端音质切换会失败）')
}

fs.writeFileSync(path.join(WWW, 'app.js'), app, 'utf8')

const list = fs.readdirSync(WWW, { recursive: true }).filter((f) => fs.statSync(path.join(WWW, f)).isFile())
console.log('mobile/www 组装完成：', list.length, '个文件')
for (const f of list) console.log('  ', f, Math.round(fs.statSync(path.join(WWW, f)).size / 1024) + 'KB')
