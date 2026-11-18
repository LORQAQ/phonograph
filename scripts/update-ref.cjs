'use strict'
/* 单独更新分支引用到 cf88b42 */
const https = require('node:https')

const TOKEN = process.env.GITHUB_TOKEN || ''
const OWNER = 'LORQAQ'
const REPO = 'phonograph'
const TARGET = process.env.TARGET_SHA || ''

if (!TOKEN || !TARGET) { console.log('缺少 GITHUB_TOKEN 或 TARGET_SHA'); process.exit(1) }

function req (method, p, body) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body), 'utf8') : null
    const r = https.request({
      hostname: 'api.github.com',
      path: p,
      method,
      headers: Object.assign({
        'User-Agent': 'phonograph',
        Authorization: 'token ' + TOKEN,
        Accept: 'application/vnd.github+json',
      }, data ? { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': data.length } : {}),
      timeout: 30000,
    }, (res) => {
      let d = ''
      res.on('data', (c) => { d += c })
      res.on('end', () => {
        console.log('  status=' + res.statusCode)
        try { resolve(JSON.parse(d)) } catch (e) { resolve(d) }
      })
    })
    r.on('error', reject)
    if (data) r.write(data)
    r.end()
  })
}

;(async () => {
  console.log('=== 更新分支到 ' + TARGET.slice(0, 7) + ' ===')
  const out = await req('PATCH', '/repos/' + OWNER + '/' + REPO + '/git/refs/heads/main', {
    sha: TARGET,
    force: true,
  })
  console.log('  结果: ' + JSON.stringify(out).slice(0, 200))

  /* 验证 */
  const check = await req('GET', '/repos/' + OWNER + '/' + REPO + '/git/ref/heads/main')
  console.log('\n=== 验证 ===')
  console.log('  远程 main: ' + (check && check.object ? check.object.sha.slice(0, 7) : '?'))
})()
