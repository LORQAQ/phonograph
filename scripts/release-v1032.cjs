'use strict'
/* 发布 v1.0.32 —— 回滚版本 */
const https = require('node:https')
const fs = require('node:fs')
const T = process.env.GITHUB_TOKEN || ''
const O = 'LORQAQ'
const R = 'phonograph'
const VER = '1.0.32'
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

let upFail = 0
function up (id, f, n) {
  return new Promise((res) => {
    if (!fs.existsSync(f)) { console.log('  ✗ 不存在: ' + f); upFail++; return res() }
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
          if (j.browser_download_url) {
            const okSize = Math.abs(j.size - d.length) < 1024
            console.log('  ' + (okSize ? '✓' : '✗') + ' ' + n + '  ' + (j.size / 1048576).toFixed(2) + ' MB')
            console.log('     ' + j.browser_download_url)
            if (!okSize) upFail++
          } else { console.log('  ✗ ' + n + ' ' + JSON.stringify(j).slice(0, 120)); upFail++ }
        } catch (e) { console.log('  ✗ ' + n + ' ' + s.slice(0, 80)); upFail++ }
        res()
      })
    })
    r.on('error', (e) => { console.log('  ✗ ' + n + ' ' + e.message); upFail++; res() })
    r.write(d)
    r.end()
  })
}

const BODY = `## 回滚版 —— 恢复可用状态

上一版（1.0.31）那一轮的大范围重构引入了回归：**手机端所有歌都没歌词，UI 也乱了**。

这一版的处理：\`public/ mobile/ app/\` 整体回滚到 **1.0.30**（那个你说能用的版本），
只重新应用你唯一要求的那个修复。

### 唯一保留的修复

设置里填 \`D:\\音乐\` 点保存报「目录不可用：目录不可写（EPERM...）」。

根因是我之前在保存下载目录时加了个**写探测**，并且把它做成了硬性拦截：

\`\`\`js
if (!writable) throw ...400
\`\`\`

但实测这台机器上：

\`\`\`
PowerShell 写 D:\\音乐   ✓ 可以
Node fs.writeFile       ✗ EPERM
Node fs.access W_OK     ✓ 可以
\`\`\`

写探测会误报（杀软、受控文件夹、权限策略都可能让 open 拿到 EPERM），
而真实下载走的是另一条代码路径。拿它去阻止保存，就会把正常目录挡在外面。

改成：**只有 mkdir 失败、或同名文件占位才报错**；写探测不再阻止保存。

实测：\`POST /api/download-dir?set=D:\\音乐\` → \`200 {"dir":"D:\\\\音乐","writable":true}\`，读回一致。

### 真机验证（1.0.32 / versionCode 21）

| 项目 | 结果 |
|---|---|
| 启动 | ✓ 无 JS 错误 |
| 播放 | ✓ 进度正常前进 |
| 歌词面板 | ✓ 陪你走完了远方 / 你听那谁在唱那一首悲伤（高亮）/ … |
| 桌面歌词悬浮窗 | ✓ 大雨中淋湿 / 终于看透你的心 |
| 音量 | ✓ 全程 0，未出声 |

### 我的问题

连着几轮我都在「修 bug」，但每次改动面太大、又没在真机上跑，结果把能用的功能改坏了。
这次的回滚是承认这一点。

后面只做**小范围、真机验证过**的改动，不再做大重构。
`

;(async () => {
  const ref = await api('GET', '/repos/' + O + '/' + R + '/git/ref/heads/main')
  console.log('远程 main: ' + (ref.body && ref.body.object ? ref.body.object.sha.slice(0, 7) : '?'))

  const rel = await api('POST', '/repos/' + O + '/' + R + '/releases', {
    tag_name: 'v' + VER, name: '留声 ' + VER + '（回滚版）', body: BODY, draft: false, prerelease: false,
  })
  if (rel.status !== 201) { console.log('失败 ' + rel.status + ' ' + JSON.stringify(rel.body).slice(0, 200)); process.exitCode = 1; return }
  console.log('Release ' + rel.body.tag_name + ' ID=' + rel.body.id)

  await up(rel.body.id, 'C:/Users/Administrator/Desktop/留声-' + VER + '-安装包.exe', 'Liusheng-' + VER + '-Setup.exe')
  await up(rel.body.id, 'C:/Users/Administrator/Desktop/留声-' + VER + '.apk', 'Liusheng-' + VER + '.apk')

  const chk = await api('GET', '/repos/' + O + '/' + R + '/releases/' + rel.body.id + '/assets')
  if (Array.isArray(chk.body)) {
    console.log('\n回读附件: ' + chk.body.length + ' 个')
    chk.body.forEach((a) => console.log('  ' + a.name + '  ' + (a.size / 1048576).toFixed(2) + ' MB'))
    if (chk.body.length !== 2) upFail++
  }
  if (upFail) { console.log('\n✗ ' + upFail + ' 个问题'); process.exitCode = 1 }
  else console.log('\n✓ 完成')
})()