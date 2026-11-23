'use strict'
/* 发布 v1.0.33 —— 回滚版本 */
const https = require('node:https')
const fs = require('node:fs')
const T = process.env.GITHUB_TOKEN || ''
const O = 'LORQAQ'
const R = 'phonograph'
const VER = '1.0.33'
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

const BODY = `## 这一版修了两个真 bug

### 1. 窄屏布局塌掉（手机版，宽度 ≤860px）

截图里：670px 宽时右侧唱机/歌词面板不隐藏，和中间内容、底部标签栏挤在一起，中间一大片空白。

根因是 \`style.css\` **末尾**有一段无条件的规则：

\`\`\`css
.deck{ display:flex; flex-direction:column; min-height:0; overflow:hidden; }
\`\`\`

它和 \`@media (max-width:860px)\` 里的 \`.deck{display:none}\` 特异性相同，但写在后面 —— 后出现者胜。
所以窄屏下右侧面板永远显示。它的 \`overflow:hidden\` 还会盖掉窄屏全屏播放页需要的 \`overflow-y:auto\`，那一页不能滚动。

改成只在 \`@media (min-width:861px)\` 里生效（基础规则第 304 行本来就有 \`display:flex\`）。

顺带修掉同一区块里的嵌套注释 bug：

\`\`\`css
body.m-deck /* 注释 */ body.m-deck .deck-tabs{...}
\`\`\`

注释被当成顺序分隔符，两条选择器被拼成后代选择器，永远命中不了。

### 2. 设置里填 \`D:\音乐\` 被拒

写探测被做成了硬拦截。实测本机：PowerShell 能写这个目录，Node 的 open 却报 EPERM，
而真实下载走的是另一条代码路径 —— 拿探测结果阻止保存，会把正常目录挡在外面。

改成只有 mkdir 失败、或同名文件占位才返回 400。

### 真机验证（1.0.33 / versionCode 22）

| 场景 | 结果 |
|---|---|
| 1080x1920 原生分辨率 | ✓ 文字清晰、布局正常 |
| 强制 670x1197 窄屏 | ✓ 单列 + 底部标签栏，右侧面板隐藏 |
| 播放 | ✓ 正常，进度前进 |
| 歌词面板 | ✓ 正常显示并跟随高亮 |
| 下载目录 \`D:\音乐\` | ✓ 200 \`writable:true\` |

### 关于上一版

1.0.31 那轮大范围重构引入了回归（手机端歌词全空、UI 乱），已整体回滚到 1.0.30 基线。
这一版只保留上面两个修复，其余一律不动。`

;(async () => {
  const ref = await api('GET', '/repos/' + O + '/' + R + '/git/ref/heads/main')
  console.log('远程 main: ' + (ref.body && ref.body.object ? ref.body.object.sha.slice(0, 7) : '?'))

  const rel = await api('POST', '/repos/' + O + '/' + R + '/releases', {
    tag_name: 'v' + VER, name: '留声 ' + VER, body: BODY, draft: false, prerelease: false,
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