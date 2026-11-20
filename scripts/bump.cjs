'use strict'
/* 通用版本号设置：node bump.cjs 1.0.28 17 */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

const NEW = process.argv[2] || '1.0.28'
const CODE = process.argv[3] || '17'

const out = []

/* 1. 前端 */
let s = fs.readFileSync('public/app.js', 'utf8')
const m1 = s.match(/const APP_VERSION = '([^']+)'/)
const old1 = m1 ? m1[1] : '?'
if (!m1) { console.log('✗ public/app.js 找不到 APP_VERSION'); process.exit(1) }
s = s.replace(/const APP_VERSION = '[^']+'/, "const APP_VERSION = '" + NEW + "'")
fs.writeFileSync('public/app.js', s, 'utf8')
out.push('public/app.js APP_VERSION: ' + old1 + ' → ' + NEW)

/* 2. AndroidManifest */
const mp = '../apk-build/app/AndroidManifest.xml'
let mf = fs.readFileSync(mp, 'utf8')
const oldCode = (mf.match(/android:versionCode="(\d+)"/) || [])[1]
const oldName = (mf.match(/android:versionName="([^"]+)"/) || [])[1]
mf = mf.replace(/android:versionCode="\d+"/, 'android:versionCode="' + CODE + '"')
mf = mf.replace(/android:versionName="[^"]+"/, 'android:versionName="' + NEW + '"')
fs.writeFileSync(mp, mf, 'utf8')
out.push('AndroidManifest: code ' + oldCode + '→' + CODE + ', name ' + oldName + '→' + NEW)

/* 3. 服务端 health */
let sv = fs.readFileSync('app/server.js', 'utf8')
const m3 = sv.match(/version: '([^']+)', pid: process\.pid/)
if (m3) {
  sv = sv.replace(/version: '[^']+', pid: process\.pid/, "version: '" + NEW + "', pid: process.pid")
  fs.writeFileSync('app/server.js', sv, 'utf8')
  out.push('server.js health: ' + m3[1] + ' → ' + NEW)
} else {
  out.push('⚠ server.js 没找到 health version')
}

/* 4. 校验 */
const chk = fs.readFileSync('public/app.js', 'utf8')
const chkM = fs.readFileSync(mp, 'utf8')
const chkS = fs.readFileSync('app/server.js', 'utf8')

console.log('=== 变更 ===')
out.forEach((o) => console.log('  ' + o))

console.log('\n=== 校验 ===')
const v1 = (chk.match(/const APP_VERSION = '([^']+)'/) || [])[1]
const v2 = (chkM.match(/android:versionName="([^"]+)"/) || [])[1]
const v3 = (chkM.match(/android:versionCode="(\d+)"/) || [])[1]
const v4 = (chkS.match(/version: '([^']+)', pid/) || [])[1]
console.log('  app.js:        ' + v1)
console.log('  versionName:   ' + v2)
console.log('  versionCode:   ' + v3)
console.log('  server health: ' + v4)

const allSame = v1 === NEW && v2 === NEW && v4 === NEW
console.log('\n  ' + (allSame ? '✓ 三处版本号一致' : '✗ 不一致！'))
if (!allSame) process.exitCode = 1
