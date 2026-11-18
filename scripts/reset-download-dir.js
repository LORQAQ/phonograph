'use strict'
/* 打包前清理：把下载目录恢复默认，确保新用户开箱即用 */
const fs = require('node:fs')

try {
  const d = JSON.parse(fs.readFileSync('data/db.json', 'utf8'))
  if (d.settings) {
    delete d.settings.downloadDir
    fs.writeFileSync('data/db.json', JSON.stringify(d, null, 2), 'utf8')
    console.log('已清除 downloadDir，恢复默认 Downloads/Liusheng')
  }
} catch (e) {
  console.log('db 处理失败:', e.message)
}

/* 打包用 payload 里的 db 也清掉 */
const payloadDb = 'build/payload/data/db.json'
try {
  if (fs.existsSync(payloadDb)) {
    const d = JSON.parse(fs.readFileSync(payloadDb, 'utf8'))
    if (d.settings) delete d.settings.downloadDir
    fs.writeFileSync(payloadDb, JSON.stringify(d, null, 2), 'utf8')
    console.log('payload db 也清了')
  }
} catch (e) { }
