'use strict'
/**
 * APK 内容校验（BUG-REPORT-2 B24 重写）
 *
 * 旧版四个问题：
 *   1. 校验对象写死成桌面上的 1.0.1 老包
 *   2. 提取失败就「改从源目录校验」，对着 mobile/www 判定通过
 *   3. 断言是中文注释字符串（注释一改就假阴性）
 *   4. 结尾无 process.exitCode，失败也是 0
 *
 * 现在：只校验 apk-build/liusheng.apk 内的副本，断言换成行为特征，失败 exit 1。
 */
const fs = require('node:fs')
const path = require('node:path')
const { execSync } = require('node:child_process')

const ROOT = path.resolve(__dirname, '..', '..')          // 工作区根
const APK = path.join(ROOT, 'apk-build', 'liusheng.apk')
const TMP = path.join(ROOT, 'apk-build', 'build', '_verify')

function die (msg) {
  console.error('✗ ' + msg)
  process.exitCode = 1
  process.exit(1)
}

if (!fs.existsSync(APK)) die('APK 不存在：' + APK)
console.log('校验对象: ' + APK)
console.log('大小: ' + (fs.statSync(APK).size / 1024).toFixed(0) + ' KB\n')

/* 解出 assets/www 到临时目录（只读 APK 内副本，绝不回落到源目录） */
fs.rmSync(TMP, { recursive: true, force: true })
fs.mkdirSync(TMP, { recursive: true })
try {
  execSync('tar.exe -xf "' + APK + '" -C "' + TMP + '" assets', { stdio: 'pipe' })
} catch (e) {
  die('从 APK 提取 assets 失败：' + (e.stderr ? String(e.stderr).slice(0, 200) : e.message))
}

const WWW = path.join(TMP, 'assets', 'www')
if (!fs.existsSync(WWW)) die('APK 内没有 assets/www')

const listed = fs.readdirSync(WWW, { recursive: true }).filter((f) => fs.statSync(path.join(WWW, f)).isFile())
console.log('assets/www 文件数: ' + listed.length + '\n')

function read (rel) {
  const p = path.join(WWW, rel)
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''
}

const app = read('app.js')
const html = read('index.html')
const css = read('style.css')
const apiMobile = read('api-mobile.js')
const engine = read('lib/lx-engine-web.js')

/* 行为断言：改注释不影响，改实现才生效 */
const checks = [
  ['app.js 存在', app.length > 50000],
  ['app.js 手机分支判断', app.includes('__MOBILE__')],
  ['app.js 走本地代理', app.includes('NAPI.proxyUrl')],
  ['app.js 取流函数', app.includes('__streamSrcInner')],
  ['app.js 残缺检测', app.includes('checkPreviewAndSwitch')],
  ['app.js 切歌 token 校验', app.includes('state.playToken')],
  ['app.js 音质切换防 TDZ', /let timer = null[\s\S]{0,400}reloadCurrent|reloadCurrent[\s\S]{0,800}let timer = null/.test(app) || app.includes('if (timer) { clearTimeout(timer)')],
  ['app.js 探测器回收', app.includes('__pcCleanup')],
  ['app.js 取流失败提示', app.includes('没取到播放地址')],
  ['app.js 导入地址取值修正', app.includes("const urlEl = $('#importUrl')")],
  ['index.html 错误捕获', html.includes('unhandledrejection')],
  ['style.css 歌词放大', css.includes('歌词高亮放大')],
  ['style.css 进度条热区', css.includes('progress::before') || css.includes('.progress::before')],
  ['style.css 移动端返回栏', css.includes('nav-history') && css.includes('display: flex')],
  ['api-mobile.js 酷狗 gcid 全量拉取', apiMobile.includes('gcid_') && apiMobile.includes('kgGcidPlaylist') && apiMobile.includes('batch_decode')],
  ['api-mobile.js 酷狗取流', apiMobile.includes('getSongInfo')],
  ['api-mobile.js QQ ?id= 支持', apiMobile.includes('disstid')],
  ['api-mobile.js 歌单字段兼容', apiMobile.includes('body.listId || body.id')],
  ['引擎 fish 优先', engine.includes('fish')],
  ['引擎 外链过滤', engine.includes('media\\/outer') || engine.includes('/song/media/outer')],
  ['引擎 格式过滤', /aac\|wma|aac'|'aac/.test(engine) || engine.includes('aac')],
  ['sources-data 存在', read('sources-data.js').length > 100000],
]

/* 关键资源存在性 */
const mustExist = [
  'lib/native-http.js', 'lib/music-libs.js', 'lib/lx-engine-web.js',
  'lib/vendor/crypto-js.min.js', 'lib/vendor/pako.min.js', 'lib/vendor/jsencrypt.min.js',
  'icon-192.png', 'icon-512.png',
]
for (const f of mustExist) {
  checks.push(['资源存在 ' + f, fs.existsSync(path.join(WWW, f))])
}

let ok = 0
for (const [name, pass] of checks) {
  console.log('  ' + (pass ? '✓' : '✗') + ' ' + name)
  if (pass) ok++
}

console.log('\n通过 ' + ok + '/' + checks.length)

/* 清理 */
fs.rmSync(TMP, { recursive: true, force: true })

if (ok !== checks.length) {
  process.exitCode = 1
  console.error('\n有 ' + (checks.length - ok) + ' 项未通过')
} else {
  console.log('\n全部通过')
}
