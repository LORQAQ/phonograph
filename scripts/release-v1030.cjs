'use strict'
/* 发布 v1.0.30 */
const https = require('node:https')
const fs = require('node:fs')
const T = process.env.GITHUB_TOKEN || ''
const O = 'LORQAQ'
const R = 'phonograph'
const VER = '1.0.30'
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

const BODY = `## 真机测试抓到的自引入 P0

上一版（1.0.29）的验证**几乎全是静态检查和 API 测试**，两个 App 一次都没真正跑起来。
这次直接装到模拟器上跑，抓到两个问题。

### 我改坏的地方

**电脑端下载被改坏**

服务端为了让 \`/api/download?save=1\` 不能被跨站 \`<img src>\` 触发，改成了必须 POST。
但 \`public/app.js:1320\` 仍然用 GET —— **电脑端点下载会直接 405**。

\`\`\`js
// 修前
r0 = await api('/api/download?' + sp0.toString())            // GET → 405
// 修后
r0 = await api('/api/download?' + sp0.toString(), { method: 'POST', body: {} })
\`\`\`

实测（1.0.30）：GET → 405，POST → 200，落盘 6.46 MB，与响应里的 size 一致。

**歌词桥接吞异常，藏了 5 轮**

\`\`\`java
try { wm.addView(root, lp); } catch (Exception e) { root = null; }   // 真实原因没了
\`\`\`

现在 \`addView\` 失败、主线程等待超时、post 失败都会 \`Log.e("Phonograph", "[歌词] ...")\`。

---

## 真机验证结果（1.0.30 / versionCode 19）

| 项目 | 结果 |
|---|---|
| **桌面歌词** | ✓ 悬浮窗显示当前句 + 下一句灰字，跟着播放更新 |
| **视图令牌** | ✓ 搜索后切排行榜，8 秒后搜索响应回来**不覆盖**页面 |
| **设置面板** | ✓ 默认音质变成主题化下拉（enhanceSelect 生效） |
| **手机下载** | ✓ 罗言 - 冬天又来临.mp3 6.7 MB 落盘 |
| **电脑下载** | ✓ POST 200，6.46 MB 落盘 |
| **播放** | ✓ 进度正常前进，flac24bit 也能放 |
| **检查更新** | ✓ 显示「当前 v1.0.30」 |
| **JS 错误** | ✓ 全流程无 Uncaught / TypeError / ReferenceError |

### 桌面歌词（之前 100% 打不开的那个）

根因是 \`WindowManager.addView\` 跑在 WebView 的桥接线程上（没有 Looper），
抛 \`IllegalStateException: The current thread must have a looper!\`，
被 \`catch (Exception e) { root = null; }\` 吞掉 → \`show()\` 恒返回 false。

修法是把 \`show/update/hide/isShowing\` 全部 \`post\` 到主线程
（\`Handler\` + \`CountDownLatch\` 同步取回返回值）。

真机截图里能看到：当前句「今年当雪花再来临的时候在你右手」+ 下一句
「已经做好所有该做的准备却还是这样的方式结尾」，和右侧歌词面板完全一致。

---

## 验证

\`\`\`
selfcheck-all.cjs     11 套件 / 163 断言   全过
服务端全量回归          36/36
检查更新实现            19/19
第六轮 5 项             13/13
写方法修复              30/30
APK 归档校验            29/29
打包产物一致性          36/36
CSS 布局计算            10 视口
APK 内容                30/30
安装包内容              26/26
LAN Origin / 更新实测   通过
\`\`\`

产物一致性：安装包 38 个源文件逐字节一致；APK 13/13；版本 1.0.30 / code 19。

---

## 说明

这次真机测试还确认了上一版宣称修好的东西**确实是好的**：
桌面歌词、视图令牌、设置面板、模拟器上全程未出声（音量 0）。
但电脑端下载是我自己改坏的 —— **只改服务端不改前端**，和上一轮的「仅支持 POST」是同一类错误。
`

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