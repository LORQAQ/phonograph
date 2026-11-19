'use strict'
/* 发布 v1.0.25 —— 检查更新功能 */
const https = require('node:https')
const fs = require('node:fs')
const T = process.env.GITHUB_TOKEN || ''
const O = 'LORQAQ'
const R = 'phonograph'
if (!T) { console.log('缺 token'); process.exit(1) }

function api (m, p, b) {
  return new Promise((res, rej) => {
    const d = b ? Buffer.from(JSON.stringify(b), 'utf8') : null
    const r = https.request({
      hostname: 'api.github.com', path: p, method: m,
      headers: Object.assign({ 'User-Agent': 'p', Authorization: 'token ' + T, Accept: 'application/vnd.github+json' },
        d ? { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': d.length } : {}),
      timeout: 60000,
    }, (x) => {
      let s = ''
      x.on('data', (c) => { s += c })
      x.on('end', () => { try { res({ status: x.statusCode, body: JSON.parse(s) }) } catch (e) { res({ status: x.statusCode, body: s }) } })
    })
    r.on('error', rej)
    if (d) r.write(d)
    r.end()
  })
}

function up (id, f, n) {
  return new Promise((res) => {
    if (!fs.existsSync(f)) { console.log('  x ' + f); return res() }
    const d = fs.readFileSync(f)
    const r = https.request({
      hostname: 'uploads.github.com',
      path: '/repos/' + O + '/' + R + '/releases/' + id + '/assets?name=' + encodeURIComponent(n),
      method: 'POST',
      headers: { 'User-Agent': 'p', Authorization: 'token ' + T, Accept: 'application/vnd.github+json', 'Content-Type': 'application/octet-stream', 'Content-Length': d.length },
      timeout: 900000,
    }, (x) => {
      let s = ''
      x.on('data', (c) => { s += c })
      x.on('end', () => {
        try {
          const j = JSON.parse(s)
          if (j.browser_download_url) { console.log('  OK ' + n + '  ' + (j.size / 1048576).toFixed(2) + ' MB'); console.log('     ' + j.browser_download_url) }
          else console.log('  x ' + n + ' ' + JSON.stringify(j).slice(0, 130))
        } catch (e) { console.log('  x ' + s.slice(0, 80)) }
        res()
      })
    })
    r.on('error', (e) => { console.log('  x ' + e.message); res() })
    r.write(d)
    r.end()
  })
}

const BODY = [
  '## 新增：检查更新',
  '',
  '设置面板底部加了一行「检查更新（当前 v1.0.25）」。',
  '',
  '### 工作方式',
  '',
  '```',
  '点「检查更新」',
  '  → GET https://api.github.com/repos/LORQAQ/phonograph/releases/latest',
  '  → 比对 tag_name 与本地 APP_VERSION（按数字逐段比，不是字符串比）',
  '  → 有新版：confirm 弹窗「发现新版本 vX.Y.Z（当前 vA.B.C）」，「要现在打开下载页吗？」',
  '      确定 → 系统浏览器打开 GitHub Release 页',
  '  → 无新版：toast「已是最新版本 v1.0.25」',
  '```',
  '',
  '### 三端打开链接的实现',
  '',
  '| 端 | 方式 |',
  '|---|---|',
  '| 桌面端 | `chrome.webview.postMessage(\'openUrl:\' + url)` → C# 外壳 `Process.Start(url)` + `UseShellExecute` |',
  '| 手机端 | `window.NAPI.openUrl(url)` → `Intent.ACTION_VIEW` + `FLAG_ACTIVITY_NEW_TASK` |',
  '| 浏览器 | `window.open(url, \'_blank\')` 兜底 |',
  '',
  '桌面端和手机端都做了协议校验（只允许 `http://` / `https://`），防止被注入 `file://` 之类。',
  '',
  '### 版本比较',
  '',
  '```js',
  'cmpVersion(\'v1.0.9\',  \'1.0.24\') → -1   // 按数字比，不是字符串',
  'cmpVersion(\'v1.0.24\', \'1.0.24\') → 0',
  'cmpVersion(\'v2.0\',    \'1.0.24\') → 1',
  '```',
  '',
  '### 实测',
  '',
  '```',
  'GitHub API 200',
  '  tag_name: v1.0.24（打这个包时）',
  '  html_url: https://github.com/LORQAQ/phonograph/releases/tag/v1.0.24',
  '  附件: Liusheng-1.0.24-Setup.exe, Liusheng-1.0.24.apk',
  '',
  'cmpVersion("v1.0.24", "1.0.24") = 0   → 提示「已是最新版本」',
  'cmpVersion("v9.9.9",  "1.0.24") = 1   → 提示「发现新版本」',
  '```',
  '',
  '### 版本号统一',
  '',
  '| 位置 | 之前 | 现在 |',
  '|---|---|---|',
  '| `public/app.js` APP_VERSION | 1.0.24 | 1.0.25 |',
  '| `AndroidManifest.xml` versionName | 1.0.13 | **1.0.25** |',
  '| `AndroidManifest.xml` versionCode | 13 | 14 |',
  '| `app/server.js` /api/health | 1.0.0 | 1.0.25 |',
  '',
  '之前 `versionName` 停在 1.0.13 好多个版本没动，这次一并修了。',
  '',
  '### 验证',
  '',
  '| 项 | 结果 |',
  '|---|---|',
  '| 检查更新实现 19 项 | 全过 |',
  '| cmpVersion 7 个用例 | 全对 |',
  '| C# 外壳编译 | 通过（67 KB） |',
  '| Java 编译 | 通过 |',
  '| APK 内容 | 30/30 |',
  '| 安装包内容 | 26/26 |',
  '| GitHub API 实测 | 200，返回 v1.0.24 |',
].join('\n')

;(async () => {
  const ref = await api('GET', '/repos/' + O + '/' + R + '/git/ref/heads/main')
  console.log('远程 main: ' + (ref.body && ref.body.object ? ref.body.object.sha.slice(0, 7) : '?'))

  const rel = await api('POST', '/repos/' + O + '/' + R + '/releases', {
    tag_name: 'v1.0.25', name: '留声 1.0.25', body: BODY, draft: false, prerelease: false,
  })
  if (rel.status !== 201) { console.log('失败 ' + rel.status + ' ' + JSON.stringify(rel.body).slice(0, 200)); return }
  console.log('Release ' + rel.body.tag_name + ' ID=' + rel.body.id)

  await up(rel.body.id, 'C:/Users/Administrator/Desktop/留声-1.0.25-安装包.exe', 'Liusheng-1.0.25-Setup.exe')
  await up(rel.body.id, 'C:/Users/Administrator/Desktop/留声-1.0.25.apk', 'Liusheng-1.0.25.apk')
  console.log('完成')
})()
