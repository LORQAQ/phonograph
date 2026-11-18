'use strict'
/* 修正上传路径：uploads.github.com 需要完整 repos/owner/repo/releases/ID/assets */
const https = require('node:https')
const fs = require('node:fs')

const TOKEN = process.env.GITHUB_TOKEN || ''
const OWNER = 'LORQAQ'
const REPO = 'phonograph'
const RELEASE_ID = 450059090

const apk = fs.readFileSync('C:/Users/Administrator/Desktop/留声-1.0.5.apk')
console.log('APK 大小: ' + (apk.length / 1024).toFixed(0) + ' KB')

const path = '/repos/' + OWNER + '/' + REPO + '/releases/' + RELEASE_ID + '/assets?name=' + encodeURIComponent('Liusheng-1.0.5.apk')

console.log('上传到: ' + path)

const req = https.request({
  hostname: 'uploads.github.com',
  path,
  method: 'POST',
  headers: {
    'User-Agent': 'phonograph',
    Authorization: 'token ' + TOKEN,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/octet-stream',
    'Content-Length': apk.length,
  },
  timeout: 300000,
}, (res) => {
  let d = ''
  res.on('data', (c) => { d += c })
  res.on('end', () => {
    console.log('status: ' + res.statusCode)
    try {
      const j = JSON.parse(d)
      if (j.browser_download_url) {
        console.log('✓ ' + (j.size / 1024).toFixed(0) + ' KB')
        console.log('  ' + j.browser_download_url)
      } else {
        console.log('响应: ' + JSON.stringify(j).slice(0, 300))
      }
    } catch (e) {
      console.log('原始响应: ' + d.slice(0, 300))
    }
  })
})
req.on('error', (e) => console.log('请求失败: ' + e.message))
req.on('timeout', () => { console.log('超时'); req.destroy() })
req.write(apk)
req.end()
