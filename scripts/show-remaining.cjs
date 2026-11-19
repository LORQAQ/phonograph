'use strict'
/* 查看剩余 7 项的现场 */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

function show (file, key, before, after, label) {
  if (!fs.existsSync(file)) { console.log('[' + label + '] 文件不存在: ' + file); return }
  const s = fs.readFileSync(file, 'utf8')
  const i = s.indexOf(key)
  console.log('\n===== ' + label + ' =====')
  if (i < 0) { console.log('  未找到: ' + key); return }
  const ls = s.lastIndexOf('\n', Math.max(0, i - (before || 200))) + 1
  console.log(s.slice(ls, i + (after || 400)))
}

/* 1. renderDownloadsView 不复位 state.view */
{
  const s = fs.readFileSync('public/app.js', 'utf8')
  const i = s.indexOf('function renderDownloadsView')
  if (i > 0) {
    console.log('\n===== 1. renderDownloadsView 开头 =====')
    console.log(s.slice(i, i + 300))
  }
}

/* 2. #btnRecImport */
show('public/app.js', 'btnRecImport', 300, 400, '2. btnRecImport')
show('public/index.html', 'btnRecImport', 200, 300, '2b. btnRecImport HTML')

/* 3. isPrivateHost */
{
  const s = fs.readFileSync('app/server.js', 'utf8')
  const i = s.indexOf('function isPrivateHost')
  if (i > 0) {
    console.log('\n===== 3. isPrivateHost =====')
    console.log(s.slice(i, i + 900))
  }
}

/* 4. reason() in LocalProxy */
{
  const s = fs.readFileSync('../apk-build/app/src/com/phonograph/player/LocalProxy.java', 'utf8')
  const i = s.indexOf('private static String reason')
  if (i > 0) {
    console.log('\n===== 4. LocalProxy.reason() =====')
    console.log(s.slice(i, i + 700))
  }
}

/* 5. 手机端 discover newSongs */
show('mobile/www/api-mobile.js', "if (p === '/api/discover')", 100, 900, '5. 手机端 discover')

/* 6. 桌面端 discover newSongs */
show('app/server.js', "/api/discover'", 100, 800, '6. 桌面端 discover')
