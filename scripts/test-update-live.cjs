'use strict'
/* 实测「检查更新」的核心逻辑：拿真实 GitHub API + 跑 cmpVersion */
const https = require('node:https')
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

function get (url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    https.get({
      hostname: u.hostname, path: u.pathname + u.search,
      headers: { 'User-Agent': 'phonograph', Accept: 'application/vnd.github+json' },
      timeout: 20000, rejectUnauthorized: false,
    }, (res) => {
      let d = ''
      res.on('data', (c) => { d += c })
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(d) }) }
        catch (e) { resolve({ status: res.statusCode, raw: d }) }
      })
    }).on('error', reject)
  })
}

;(async () => {
  console.log('=== 1. 真实 GitHub API ===')
  const r = await get('https://api.github.com/repos/LORQAQ/phonograph/releases/latest')
  console.log('  status: ' + r.status)
  if (r.json) {
    console.log('  tag_name: ' + r.json.tag_name)
    console.log('  name: ' + r.json.name)
    console.log('  html_url: ' + r.json.html_url)
    console.log('  published: ' + r.json.published_at)
    console.log('  附件: ' + (r.json.assets || []).map((a) => a.name).join(', '))
  } else {
    console.log('  非 JSON: ' + String(r.raw).slice(0, 100))
  }

  console.log('\n=== 2. cmpVersion 逻辑 ===')
  const s = fs.readFileSync('public/app.js', 'utf8')
  const m = s.match(/function cmpVersion \(a, b\) \{[\s\S]*?\n\}/)
  const fn = new Function('return ' + m[0])()

  const APP_VERSION = (s.match(/const APP_VERSION = '([^']+)'/) || [])[1]
  console.log('  当前 APP_VERSION: ' + APP_VERSION)

  const latest = r.json && r.json.tag_name
  if (latest) {
    const c = fn(latest, APP_VERSION)
    console.log('  cmpVersion("' + latest + '", "' + APP_VERSION + '") = ' + c)
    if (c > 0) console.log('  → 会提示「发现新版本」并跳转')
    else if (c === 0) console.log('  → 会提示「已是最新版本」')
    else console.log('  → 本地版本反而更高（开发中）')
  }

  console.log('\n=== 3. 模拟「有新版」场景 ===')
  const fakeLatest = 'v9.9.9'
  const c2 = fn(fakeLatest, APP_VERSION)
  console.log('  cmpVersion("' + fakeLatest + '", "' + APP_VERSION + '") = ' + c2 + (c2 > 0 ? ' ✓ 会提示更新' : ' ✗'))

  console.log('\n=== 4. 边界 ===')
  const edge = [
    ['v1.0.25', '1.0.24'],
    ['1.0.24', '1.0.24'],
    ['v1.0.9', '1.0.24'],
    ['v2.0', '1.0.24'],
    ['garbage', '1.0.24'],
  ]
  for (const [a, b] of edge) {
    console.log('  ' + a.padEnd(12) + ' vs ' + b.padEnd(8) + ' → ' + fn(a, b))
  }

  console.log('\n=== 5. 跳转 URL 构造 ===')
  const OWNER = 'LORQAQ', REPO = 'phonograph'
  console.log('  fallback: https://github.com/' + OWNER + '/' + REPO + '/releases/latest')
  console.log('  api url : https://api.github.com/repos/' + OWNER + '/' + REPO + '/releases/latest')
  if (r.json && r.json.html_url) console.log('  实际跳转: ' + r.json.html_url)
})()
