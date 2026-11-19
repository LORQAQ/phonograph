'use strict'
/* 统一版本号到 1.0.25 */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

/* 1. 前端 APP_VERSION */
let s = fs.readFileSync('public/app.js', 'utf8')
const oldV = (s.match(/const APP_VERSION = '([^']+)'/) || [])[1]
s = s.replace(/const APP_VERSION = '[^']+'/, "const APP_VERSION = '1.0.25'")
fs.writeFileSync('public/app.js', s, 'utf8')
console.log('public/app.js: ' + oldV + ' → 1.0.25')

/* 2. AndroidManifest */
let m = fs.readFileSync('../apk-build/app/AndroidManifest.xml', 'utf8')
const oldCode = (m.match(/android:versionCode="(\d+)"/) || [])[1]
const oldName = (m.match(/android:versionName="([^"]+)"/) || [])[1]
m = m.replace(/android:versionCode="\d+"/, 'android:versionCode="14"')
m = m.replace(/android:versionName="[^"]+"/, 'android:versionName="1.0.25"')
fs.writeFileSync('../apk-build/app/AndroidManifest.xml', m, 'utf8')
console.log('AndroidManifest: code ' + oldCode + '→14, name ' + oldName + '→1.0.25')

/* 3. 服务端 /api/health */
let sv = fs.readFileSync('app/server.js', 'utf8')
const oldH = (sv.match(/version: '([^']+)', pid: process\.pid/) || [])[1]
if (oldH) {
  sv = sv.replace(/version: '[^']+', pid: process\.pid/, "version: '1.0.25', pid: process.pid")
  fs.writeFileSync('app/server.js', sv, 'utf8')
  console.log('server.js health: ' + oldH + ' → 1.0.25')
}

/* 确认 */
const check = fs.readFileSync('public/app.js', 'utf8')
const checkM = fs.readFileSync('../apk-build/app/AndroidManifest.xml', 'utf8')
console.log('\n=== 确认 ===')
console.log('APP_VERSION: ' + (check.match(/const APP_VERSION = '([^']+)'/) || [])[1])
console.log('versionCode: ' + (checkM.match(/android:versionCode="(\d+)"/) || [])[1])
console.log('versionName: ' + (checkM.match(/android:versionName="([^"]+)"/) || [])[1])
