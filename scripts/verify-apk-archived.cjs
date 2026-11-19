'use strict'
/* 验证归档后的 APK 内容 */
const path = require('node:path')
const fs = require('node:fs')
const { execSync } = require('node:child_process')
process.chdir(path.resolve(__dirname, '..'))

const APKS = ['留声.apk', '留声-1.0.27.apk']
const WANT = ['async function checkUpdate', '__timeoutPromise', 'state.dlBusy', 'openUrlFail:']
const WANT_API = ["let backend = 'web'", 'if (!added) break', '__expired()']

for (const apk of APKS) {
  if (!fs.existsSync(apk)) { console.log(apk + ': 不存在'); continue }
  const tmp = 'build/_v_' + apk.replace(/[^\w]/g, '_')
  fs.rmSync(tmp, { recursive: true, force: true })
  fs.mkdirSync(tmp, { recursive: true })
  try {
    execSync('tar.exe -xf "' + apk + '" -C "' + tmp + '"', { stdio: 'pipe' })
  } catch (e) {
    console.log(apk + ': 解包失败'); continue
  }

  const appPath = path.join(tmp, 'assets', 'www', 'app.js')
  const apiPath = path.join(tmp, 'assets', 'www', 'api-mobile.js')
  if (!fs.existsSync(appPath)) { console.log(apk + ': 没有 assets/www/app.js'); fs.rmSync(tmp, { recursive: true, force: true }); continue }

  const a = fs.readFileSync(appPath, 'utf8')
  const m = fs.existsSync(apiPath) ? fs.readFileSync(apiPath, 'utf8') : ''

  const ver = (a.match(/const APP_VERSION = '([^']+)'/) || [])[1]
  console.log('\n=== ' + apk + ' ===')
  console.log('  APP_VERSION: ' + ver)
  console.log('  app.js 大小: ' + a.length + 'B')

  const missing = WANT.filter((k) => !a.includes(k))
  console.log('  前端新功能: ' + (missing.length === 0 ? '✓ 全有' : '✗ 缺 ' + missing.join(',')))

  const missingApi = WANT_API.filter((k) => !m.includes(k))
  console.log('  手机端 gcid: ' + (missingApi.length === 0 ? '✓ 已移植' : '✗ 缺 ' + missingApi.join(',')))

  fs.rmSync(tmp, { recursive: true, force: true })
}

/* 对比源文件 */
const src = fs.readFileSync('mobile/www/app.js', 'utf8')
const apkTmp = 'build/_cmpsrc'
fs.rmSync(apkTmp, { recursive: true, force: true })
fs.mkdirSync(apkTmp, { recursive: true })
try {
  execSync('tar.exe -xf "留声.apk" -C "' + apkTmp + '"', { stdio: 'pipe' })
  const apkApp = fs.readFileSync(path.join(apkTmp, 'assets', 'www', 'app.js'), 'utf8')
  console.log('\n=== 与源码一致性 ===')
  console.log('  留声.apk 内 app.js === mobile/www/app.js: ' + (apkApp === src ? '✓' : '✗ 不一致'))
} catch (e) { }
fs.rmSync(apkTmp, { recursive: true, force: true })
