'use strict'
/**
 * 校验「用户实际会安装的那个 APK」
 *
 * 修 P0-3：
 *   - 原来写死 留声-1.0.27.apk（过期），现在按 glob 找当前版本
 *   - 原来全文没有 process.exitCode，不一致时 exit=0（形同虚设），现在会失败
 *   - 原来不校验版本，现在断言 APP_VERSION === 源码版本
 *   - 现在同时校验 留声.apk（无版本号的那个，用户最可能点的）
 */
const path = require('node:path')
const fs = require('node:fs')
const { execSync } = require('node:child_process')
process.chdir(path.resolve(__dirname, '..'))

const VERSION = (fs.readFileSync('public/app.js', 'utf8').match(/const APP_VERSION = '([^']+)'/) || [])[1]
if (!VERSION) { console.log('✗ 读不到 public/app.js 的 APP_VERSION'); process.exit(1) }

let pass = 0
let fail = 0
const failures = []
function ok (n, e) { pass++; console.log('  ✓ ' + n + (e ? '  ' + e : '')) }
function bad (n, d) { fail++; failures.push(n + (d ? ' — ' + d : '')); console.log('  ✗ ' + n + (d ? '  ' + d : '')) }

/* ---------- 找出所有要校验的 APK ---------- */
const all = fs.readdirSync('.').filter((f) => /^留声.*\.apk$/.test(f))
const targets = []
/* 最新版本号的 + 无版本号的 */
if (fs.existsSync('留声.apk')) targets.push('留声.apk')
const versioned = '留声-' + VERSION + '.apk'
if (fs.existsSync(versioned)) targets.push(versioned)

console.log('================ APK 产物校验 ================')
console.log('期望版本: ' + VERSION)
console.log('目录里的 APK: ' + (all.join(', ') || '无'))
console.log('本次校验: ' + (targets.join(', ') || '无') + '\n')

if (!targets.length) {
  console.log('✗ 找不到任何要校验的 APK')
  process.exit(1)
}

const srcApp = fs.readFileSync(path.join('mobile', 'www', 'app.js'), 'utf8')
const srcApi = fs.readFileSync(path.join('mobile', 'www', 'api-mobile.js'), 'utf8')
const srcCss = fs.readFileSync(path.join('mobile', 'www', 'style.css'), 'utf8')

for (const apk of targets) {
  console.log('【' + apk + '】')
  const tmp = path.join('build', '_chk_' + apk.replace(/[^\w]/g, '_'))
  fs.rmSync(tmp, { recursive: true, force: true })
  fs.mkdirSync(tmp, { recursive: true })
  try {
    execSync('tar.exe -xf "' + apk + '" -C "' + tmp + '"', { stdio: 'pipe' })

    /* 1. 版本 —— 这是最关键的一条：上次事故就是 APK 里还是 1.0.0 */
    const appPath = path.join(tmp, 'assets', 'www', 'app.js')
    if (!fs.existsSync(appPath)) {
      bad(apk + ' 有 assets/www/app.js')
    } else {
      const s = fs.readFileSync(appPath, 'utf8')
      const v = (s.match(/const APP_VERSION = '([^']+)'/) || [])[1]
      if (v === VERSION) ok(apk + ' 版本 = ' + v)
      else bad(apk + ' 版本', '包内 ' + v + ' ≠ 期望 ' + VERSION + '（这是旧包！）')

      /* 2. 与源码逐字节一致 */
      if (s === srcApp) ok(apk + ' app.js 与源码一致')
      else bad(apk + ' app.js 与源码不一致', '包内 ' + s.length + 'B / 源码 ' + srcApp.length + 'B')

      /* 3. 关键功能特征 */
      const FEATURES = [
        ['检查更新', 'async function checkUpdate'],
        ['视图令牌', '__viewToken'],
        ['下载互斥', 'state.dlBusy'],
        ['转义下载文件名', 'esc(f.name)'],
      ]
      for (const [name, key] of FEATURES) {
        if (s.includes(key)) ok(apk + ' 含 ' + name)
        else bad(apk + ' 缺 ' + name)
      }
    }

    /* 4. api-mobile 一致 */
    const apiPath = path.join(tmp, 'assets', 'www', 'api-mobile.js')
    if (fs.existsSync(apiPath)) {
      const a = fs.readFileSync(apiPath, 'utf8')
      if (a === srcApi) ok(apk + ' api-mobile.js 与源码一致')
      else bad(apk + ' api-mobile.js 不一致')
    } else bad(apk + ' 有 api-mobile.js')

    /* 5. style.css 一致 */
    const cssPath = path.join(tmp, 'assets', 'www', 'style.css')
    if (fs.existsSync(cssPath)) {
      const c = fs.readFileSync(cssPath, 'utf8')
      if (c === srcCss) ok(apk + ' style.css 与源码一致')
      else bad(apk + ' style.css 不一致')
    } else bad(apk + ' 有 style.css')

    /* 6. 必需资源 */
    for (const need of ['index.html', 'sources-data.js', 'lib/lx-engine-web.js', 'lib/native-http.js', 'lib/music-libs.js']) {
      const p = path.join(tmp, 'assets', 'www', need.split('/').join(path.sep))
      if (fs.existsSync(p)) ok(apk + ' 有 ' + need)
      else bad(apk + ' 缺 ' + need)
    }

    /* 7. 无套娃目录 */
    const nested = path.join(tmp, 'assets', 'www', 'www')
    if (fs.existsSync(nested)) bad(apk + ' 有 www/www 套娃目录')
    else ok(apk + ' 无套娃目录')
  } catch (e) {
    bad(apk + ' 解包', e.message)
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
  console.log('')
}

/* ---------- 两个文件名内容是否相同 ---------- */
if (targets.length === 2) {
  const a = fs.readFileSync(targets[0])
  const b = fs.readFileSync(targets[1])
  if (a.equals(b)) ok('留声.apk 与 留声-' + VERSION + '.apk 完全相同')
  else bad('两个 APK 文件不同', '留声.apk 是旧的？')
}

console.log('================ 结果 ================')
console.log('通过 ' + pass + ' / 失败 ' + fail)
if (fail) {
  console.log('\n失败项:')
  failures.forEach((f) => console.log('  - ' + f))
  process.exitCode = 1
} else {
  console.log('全部通过')
}