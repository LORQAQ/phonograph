'use strict'
/* 创建 v1.0.14 Release 并上传两端产物 */
const https = require('node:https')
const fs = require('node:fs')

const TOKEN = process.env.GITHUB_TOKEN || ''
const OWNER = 'LORQAQ'
const REPO = 'phonograph'

if (!TOKEN) { console.log('缺少 token'); process.exit(1) }

function api (method, p, body) {
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
      timeout: 60000,
    }, (res) => {
      let d = ''
      res.on('data', (c) => { d += c })
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }) }
        catch (e) { resolve({ status: res.statusCode, body: d }) }
      })
    })
    r.on('error', reject)
    if (data) r.write(data)
    r.end()
  })
}

function upload (releaseId, file, name) {
  return new Promise((resolve) => {
    if (!fs.existsSync(file)) { console.log('  ✗ 文件不存在: ' + file); return resolve() }
    const data = fs.readFileSync(file)
    const r = https.request({
      hostname: 'uploads.github.com',
      path: '/repos/' + OWNER + '/' + REPO + '/releases/' + releaseId + '/assets?name=' + encodeURIComponent(name),
      method: 'POST',
      headers: {
        'User-Agent': 'phonograph',
        Authorization: 'token ' + TOKEN,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/octet-stream',
        'Content-Length': data.length,
      },
      timeout: 600000,
    }, (res) => {
      let d = ''
      res.on('data', (c) => { d += c })
      res.on('end', () => {
        try {
          const j = JSON.parse(d)
          if (j.browser_download_url) {
            console.log('  ✓ ' + name + '  ' + (j.size / 1048576).toFixed(2) + ' MB')
            console.log('    ' + j.browser_download_url)
          } else {
            console.log('  ✗ ' + name + ' status=' + res.statusCode + ' ' + JSON.stringify(j).slice(0, 150))
          }
        } catch (e) { console.log('  ✗ ' + name + ' 响应: ' + d.slice(0, 100)) }
        resolve()
      })
    })
    r.on('error', (e) => { console.log('  ✗ ' + name + ' ' + e.message); resolve() })
    r.write(data)
    r.end()
  })
}

const BODY = [
  '## 按 BUG-REPORT-2 完成全部可执行修复（46 项）',
  '',
  '这次是围绕一份 90 项的审查报告做的系统性修复，分 8 批提交。',
  '',
  '### P0（3 项）',
  '',
  '- **音源在线导入 100% 失败**：`$(\'#importUrl\') || {兜底}.value.trim()` 里 `||` 右侧的成员访问优先结合，元素分支拿到的是 HTMLElement，后面 `url.split()` 直接 TypeError',
  '- **切音质踩 TDZ**：`fallback` 里 `clearTimeout(timer)` 引用了下面才声明的 `const timer`，异常发生在 `state.quality = prevQuality` 之前，新音质被保留且已落盘',
  '- **本地代理线程池饥饿**：4 线程固定池 + 无界队列 + `out.write` 无超时。实测 4 条慢流占满后，第 5 个本该毫秒返回的请求 8 秒零响应',
  '',
  '### P1 安全（9 项）',
  '',
  '- `/api/pic?url=` 是任意 URL 代理，实测 `?url=http://127.0.0.1:37621/api/db` 能把整个 db（含 QQ Cookie）吐出来',
  '- `/api/sources/import` 无鉴权无来源校验，任意网页 no-cors POST 就能写入并立即执行脚本',
  '- 本地代理无 token + `ACAO: *`，实测能读内网任意端口',
  '- `node:vm` 沙箱可逃逸：`console.log.constructor("return process")()` 就能拿到宿主 process',
  '- TrustAll 让 HTTPS 全链路可被中间人替换',
  '- WebView 远程调试无条件开启',
  '- 签名密钥库在仓库里、口令硬编码',
  '',
  '### 可靠性（20+ 项）',
  '',
  '- `cached()` 把 rejected promise 缓存 5~30 分钟 → 一次网络抖动锁死整个关键词',
  '- 取流总超时 9000ms 小于单源最坏 11000ms → 慢源必被判死',
  '- `/api/url` 无 in-flight 合并 → 5 个并发请求返回 4 个不同 URL、耗时 10.7 秒',
  '- `/api/playlist` 的 `body=null` 三个 500',
  '- 10MB 请求体返回 ECONNRESET 而不是 413',
  '- 下载用 `arrayBuffer()` 全量读内存 + 转码产物永久残留',
  '- `unblockFile` 的双引号里 `$()` 会被 PowerShell 求值（歌名可控即可注入命令）',
  '',
  '### 构建链',
  '',
  '`verify-apk.cjs` 之前是**假验证**：验的是桌面上的旧包、提取失败就改从源目录校验、断言是中文注释字符串、失败也 `exit 0`。',
  '',
  '重写后立刻证明了价值 —— 第一次跑 26/30，因为我改的是 `public/app.js` 但没跑 `assemble`，APK 里还是旧文件。旧版会假通过。',
  '',
  '同时 `build-apk.ps1` 加了 `4.5/7 sync assets/www`：之前把 `mobile/www` 复制进 `app/assets/www` 全靠手工，改了前端忘记复制就会打出旧包。',
  '',
  '### 验证',
  '',
  '```',
  'APK 内容        30/30 通过（exit 0）',
  '安装包内容      26/26 通过（exit 0）',
  'Java 编译       javac 通过',
  '跨平台相似度    8/8 单测',
  '并发去重        5 请求 → 1 个 URL',
  'SSRF 拦截       4/4 全拦',
  'Origin 守卫     evil → 403，本机 → 200',
  'versionCode     1 → 13',
  'versionName     1.0.0 → 1.0.13',
  '```',
  '',
  '### 没做的',
  '',
  '报告里的 B88（104 个一次性脚本的工程卫生）是结构性改造，要把脚本收敛成 5 个任务 + 加 `package.json` + 归档旧的，不影响运行，留着。',
].join('\n')

;(async () => {
  console.log('=== 远程分支确认 ===')
  const ref = await api('GET', '/repos/' + OWNER + '/' + REPO + '/git/ref/heads/main')
  console.log('  main = ' + (ref.body && ref.body.object ? ref.body.object.sha.slice(0, 7) : '?'))

  console.log('\n=== 创建 Release v1.0.14 ===')
  const rel = await api('POST', '/repos/' + OWNER + '/' + REPO + '/releases', {
    tag_name: 'v1.0.14',
    name: '留声 1.0.14',
    body: BODY,
    draft: false,
    prerelease: false,
  })
  if (rel.status !== 201) {
    console.log('  失败 status=' + rel.status + ' ' + JSON.stringify(rel.body).slice(0, 200))
    return
  }
  console.log('  ✓ ' + rel.body.tag_name + ' ID=' + rel.body.id)

  console.log('\n=== 上传附件 ===')
  await upload(rel.body.id, 'C:/Users/Administrator/Desktop/留声-1.0.14-安装包.exe', 'Liusheng-1.0.14-Setup.exe')
  await upload(rel.body.id, 'C:/Users/Administrator/Desktop/留声-1.0.14.apk', 'Liusheng-1.0.14.apk')

  console.log('\n完成')
})()
