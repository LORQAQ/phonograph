'use strict'
/* 给已存在的 Release 补上传附件（不重复创建） */
const https = require('node:https')
const fs = require('node:fs')
const path = require('node:path')
process.chdir(path.resolve(__dirname, '..'))

const T = process.env.GITHUB_TOKEN || ''
const O = 'LORQAQ'
const R = 'phonograph'
const VER = '1.0.33'
const RID = Number(process.env.RELEASE_ID || 0)
if (!T || !RID) { console.log('缺 token 或 RELEASE_ID'); process.exit(1) }

let fail = 0
function up (id, f, n) {
  return new Promise((res) => {
    if (!fs.existsSync(f)) { console.log('  ✗ 不存在: ' + f); fail++; return res() }
    const d = fs.readFileSync(f)
    const r = https.request({
      hostname: 'uploads.github.com',
      path: '/repos/' + O + '/' + R + '/releases/' + id + '/assets?name=' + encodeURIComponent(n),
      method: 'POST',
      headers: {
        'User-Agent': 'p', Authorization: 'token ' + T,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/octet-stream',
        'Content-Length': d.length,
      },
      timeout: 900000,
    }, (x) => {
      let s = ''
      x.on('data', (c) => { s += c })
      x.on('end', () => {
        try {
          const j = JSON.parse(s)
          if (j.browser_download_url) {
            const okSize = Math.abs(j.size - d.length) < 1024
            console.log('  ' + (okSize ? '✓' : '✗') + ' ' + n + '  ' + (j.size / 1048576).toFixed(2) + ' MB')
            console.log('     ' + j.browser_download_url)
            if (!okSize) fail++
          } else { console.log('  ✗ ' + n + '  ' + JSON.stringify(j).slice(0, 140)); fail++ }
        } catch (e) { console.log('  ✗ ' + n + '  ' + s.slice(0, 90)); fail++ }
        res()
      })
    })
    r.on('error', (e) => { console.log('  ✗ ' + n + '  ' + e.message); fail++; res() })
    r.write(d)
    r.end()
  })
}

function get (p) {
  return new Promise((res, rej) => {
    const r = https.request({
      hostname: 'api.github.com', path: p, method: 'GET',
      headers: { 'User-Agent': 'p', Authorization: 'token ' + T, Accept: 'application/vnd.github+json' },
      timeout: 60000,
    }, (x) => {
      let s = ''
      x.on('data', (c) => { s += c })
      x.on('end', () => { try { res(JSON.parse(s)) } catch (e) { res(null) } })
    })
    r.on('error', rej)
    r.end()
  })
}

;(async () => {
  const home = process.env.USERPROFILE || 'C:/Users/Administrator'
  console.log('上传到 Release ' + RID)
  await up(RID, path.join(home, 'Desktop', '留声-' + VER + '-安装包.exe'), 'Liusheng-' + VER + '-Setup.exe')
  await up(RID, path.join(home, 'Desktop', '留声-' + VER + '.apk'), 'Liusheng-' + VER + '.apk')

  const assets = await get('/repos/' + O + '/' + R + '/releases/' + RID + '/assets')
  if (Array.isArray(assets)) {
    console.log('\n回读附件: ' + assets.length + ' 个')
    assets.forEach((a) => console.log('  ' + a.name + '  ' + (a.size / 1048576).toFixed(2) + ' MB'))
    if (assets.length !== 2) fail++
  }
  console.log(fail ? '\n✗ ' + fail + ' 个问题' : '\n✓ 完成')
  if (fail) process.exitCode = 1
})()