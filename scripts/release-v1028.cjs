'use strict'
/* 发布 v1.0.28 */
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
  '## 修复：设置里保存下载目录报「仅支持 POST」',
  '',
  '### 根因',
  '',
  '前几轮我只修了**服务端**（把 `/api/download-dir` 从强制 POST 名单里移出来、',
  '在 handler 内单独判定写语义），**从没改前端的请求方式**。',
  '前端一直用 GET 发 `?set=`，服务端要求 POST，就 405 了。',
  '',
  '### 审计发现不止一处',
  '',
  '写脚本把 `public/app.js` 里所有 `api()` 调用过了一遍，**5 处写操作全在用 GET**：',
  '',
  '| 调用 | 操作 | 后果 |',
  '|---|---|---|',
  '| `download-dir?set=` | 保存下载目录 | 405（你截图这个） |',
  '| `download-dir?set=` | 选目录后回填 | 405 |',
  '| `downloads/remove` | 删除已下载文件 | 405 |',
  '| `downloads/reveal` | 打开文件夹 | 能用但有 CSRF 风险 |',
  '| `sources/test` | 音源测速 | 能用但有 CSRF 风险 |',
  '',
  '全部改成 POST；服务端把 `reveal` 和 `sources/test` 补进写名单。',
  '',
  '### 顺手修的两个真问题',
  '',
  '**1. 坏路径会被存进数据库**',
  '',
  '```js',
  'try { fs.mkdirSync(dir, { recursive: true }) } catch (e) { }  // 错误被吞',
  'db.settings.downloadDir = dir                                 // 照样存',
  '```',
  '',
  '填一个建不出来的路径（比如没有 D 盘却填 `D:\\Music`），会看到「已保存」，',
  '之后每次下载都失败，还找不到原因。改成：建不出来就 400 报错，绝不存。',
  '',
  '**2. 提示在说假话**',
  '',
  '```',
  '已设为：xxx（当前进程写不进去，重启程序后一般正常）',
  '```',
  '',
  '路径本身不存在，重启一万次也没用。已删除。',
  '',
  '**3. 留空虚设不生效** — placeholder 写着「留空使用 音乐\\留声」，但清空保存什么都不做。现在清空 = 恢复默认目录。',
  '',
  '### 三层验证',
  '',
  '**源码层** `verify-write-fix.cjs` — 30/30',
  '',
  '**真实 HTTP 层**（服务在跑，发真请求）',
  '',
  '```',
  '✓ POST ?set= 200  writable=true',
  '✓ GET 读回一致',
  '✓ 坏路径 400  目录无法创建（EPERM...）',
  '✓ 坏路径没覆盖已存的',
  '✓ 空值恢复默认',
  '✓ GET ?set= 405（正确拒绝）',
  '```',
  '',
  '`regress-all.cjs` 36/36 · `selfcheck-all.cjs` 8 套件 / 68 断言',
  '',
  '**打包产物层** `verify-packaged-posts.cjs` — 24/24',
  '',
  '```',
  '✓ 安装包内 app.js 版本 1.0.28 + 5 处 POST 全在',
  '✓ APK 内 app.js 版本 1.0.28 + 5 处 POST 全在',
  '✓ APK 内 app.js 与源码逐字节一致',
  '```',
  '',
  '### 真机',
  '',
  'Android 15 / 1080x1920，装 1.0.28（versionCode=17）：6 个音源全加载、设置面板正常打开、',
  '下载目录/QQ Cookie/下载格式/外观/配色 全部可见可点、音量全程 0。',
  '',
  '### 关于上次的教训',
  '',
  '上一版 `留声.apk` 还是 1.0.0，用户装的旧包没有新功能。',
  '这次打包后强制归档并解包逐字节校验，`verify-apk-archived.cjs` 会挡住这类问题。',
].join('\n')

;(async () => {
  const ref = await api('GET', '/repos/' + O + '/' + R + '/git/ref/heads/main')
  console.log('远程 main: ' + (ref.body && ref.body.object ? ref.body.object.sha.slice(0, 7) : '?'))

  const rel = await api('POST', '/repos/' + O + '/' + R + '/releases', {
    tag_name: 'v1.0.28', name: '留声 1.0.28', body: BODY, draft: false, prerelease: false,
  })
  if (rel.status !== 201) { console.log('失败 ' + rel.status + ' ' + JSON.stringify(rel.body).slice(0, 200)); return }
  console.log('Release ' + rel.body.tag_name + ' ID=' + rel.body.id)

  await up(rel.body.id, 'C:/Users/Administrator/Desktop/留声-1.0.28-安装包.exe', 'Liusheng-1.0.28-Setup.exe')
  await up(rel.body.id, 'C:/Users/Administrator/Desktop/留声-1.0.28.apk', 'Liusheng-1.0.28.apk')
  console.log('完成')
})()