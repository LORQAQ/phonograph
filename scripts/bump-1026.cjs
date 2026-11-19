'use strict'
/* 版本 1.0.26 */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

const NEW = '1.0.26'
const NEW_CODE = '15'

/* 1. 前端 */
let s = fs.readFileSync('public/app.js', 'utf8')
const oldV = (s.match(/const APP_VERSION = '([^']+)'/) || [])[1]
s = s.replace(/const APP_VERSION = '[^']+'/, "const APP_VERSION = '" + NEW + "'")
fs.writeFileSync('public/app.js', s, 'utf8')
console.log('public/app.js: ' + oldV + ' → ' + NEW)

/* 2. AndroidManifest */
let m = fs.readFileSync('../apk-build/app/AndroidManifest.xml', 'utf8')
const oldCode = (m.match(/android:versionCode="(\d+)"/) || [])[1]
const oldName = (m.match(/android:versionName="([^"]+)"/) || [])[1]
m = m.replace(/android:versionCode="\d+"/, 'android:versionCode="' + NEW_CODE + '"')
m = m.replace(/android:versionName="[^"]+"/, 'android:versionName="' + NEW + '"')
fs.writeFileSync('../apk-build/app/AndroidManifest.xml', m, 'utf8')
console.log('AndroidManifest: code ' + oldCode + '→' + NEW_CODE + ', name ' + oldName + '→' + NEW)

/* 3. server */
let sv = fs.readFileSync('app/server.js', 'utf8')
const oldH = (sv.match(/version: '([^']+)', pid: process\.pid/) || [])[1]
if (oldH) {
  sv = sv.replace(/version: '[^']+', pid: process\.pid/, "version: '" + NEW + "', pid: process.pid")
  fs.writeFileSync('app/server.js', sv, 'utf8')
  console.log('server.js health: ' + oldH + ' → ' + NEW)
}

/* 确认 */
console.log('\n=== 确认 ===')
console.log('APP_VERSION: ' + (fs.readFileSync('public/app.js', 'utf8').match(/const APP_VERSION = '([^']+)'/) || [])[1])
const cm = fs.readFileSync('../apk-build/app/AndroidManifest.xml', 'utf8')
console.log('versionCode: ' + (cm.match(/android:versionCode="(\d+)"/) || [])[1])
console.log('versionName: ' + (cm.match(/android:versionName="([^"]+)"/) || [])[1])
