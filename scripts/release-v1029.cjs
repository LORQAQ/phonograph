'use strict'
/* 发布 v1.0.29 —— 第六轮全源码审查修复 */
const https = require('node:https')
const fs = require('node:fs')
const T = process.env.GITHUB_TOKEN || ''
const O = 'LORQAQ'
const R = 'phonograph'
const VER = '1.0.29'
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
            const sizeOk = Math.abs(j.size - d.length) < 1024
            console.log('  ' + (sizeOk ? '✓' : '✗') + ' ' + n + '  ' + (j.size / 1048576).toFixed(2) + ' MB' + (sizeOk ? '' : '（大小不符！）'))
            console.log('     ' + j.browser_download_url)
            if (!sizeOk) upFail++
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

const BODY = `## 第六轮全源码审查修复

4 个独立审查员 + 静态扫描，覆盖全部 11,500 行源码，共发现 **88 个问题**。
完整报告见仓库里的 \`REPORT-v6.md\`。

### P0（3 条，全部实测验证）

**P0-1 \`dbRetry\` 从未声明 —— 写盘重试完全失效**

\`\`\`js
// app/server.js
let dbDirty = false
let dbFirstDirtyAt = 0
// ← 缺少 let dbRetry = 0
96:     dbRetry = 0                                    // 抛 ReferenceError
104:    dbRetry = Math.min((dbRetry || 0) + 1, 6)      // 再抛，炸出函数
107:    if (!saveTimer) saveTimer = setTimeout(flushDb, __delay)   // 永远到不了
\`\`\`

\`'use strict'\` 下每次保存都抛 ReferenceError，被 catch 当成「写盘失败」。
后果：日志天天报假错，而**真失败时（磁盘满/文件被占用）磁盘上永远是旧值，重试永不排期**。

实测：把 \`data\` 换成文件制造 EEXIST → 恢复目录 → \`volume=0.33\` 自动落盘成功。

**P0-2 安装包 zip 的中文条目名是 GBK 且未置 UTF-8 标志**

\`\`\`
留声.exe 存成 c1f4c9f9（GBK），flags 无 bit 11
\`\`\`

非 936 的 Windows（英文/日文/韩文系统）解出乱码文件名 → 快捷方式指向不存在的文件 → **用户装完打不开**。
同仓库已有化石证据：\`apk-build\\鐣欏０.apk.idsig\`。

修：新写 \`scripts/make-payload-zip.cjs\`，自己构造 zip，强制 UTF-8 + 置 bit 11。
实测：\`留声.exe\` 从 \`c1f4c9f9\` 变为 \`e79599e5a3b0\` + \`flags=0x0800\`，
并用 .NET \`ZipArchive\`（安装器实际用的 API）探针确认能正确解出。

**P0-3 归档无脚本执行，唯一「旧包闸门」永远不会失败**

- \`verify-apk-archived.cjs\` 全文**没有 \`process.exitCode\`**，不一致只打印 \`✗\`
- 还写死了 \`留声-1.0.27.apk\`（过期），不校验版本
- 全仓**没有任何脚本执行归档**

**这正是上次「留声.apk 还是 1.0.0」事故的根因，一直没修。**

修：重写该脚本（glob 找当前版本 + 版本断言 + exitCode），归档写进 \`build-all.cjs\`。

反向实测：把 1.0.27 冒充 \`留声.apk\` →

\`\`\`
✗ 留声.apk 版本 — 包内 1.0.27 ≠ 期望 1.0.28（这是旧包！）
✗ 留声.apk 缺 视图令牌
✗ 两个 APK 文件不同
通过 23 / 失败 6   exit=1
\`\`\`

### P1（21 条）

**服务端**

| 问题 | 修法 |
|---|---|
| \`/api/sources/test\` 无超时，脚本卡住则接口永久挂起 | 单源 5s + 路由 12s（实测 5045ms 返回） |
| \`/api/sources/import\` 导入新音源必 500（文件已落盘） | \`reload\` → \`loadOne\` |
| \`/api/download?save=1\` 用 GET 就能触发写盘（CSRF） | 要求 POST（实测 GET 405） |
| 同源校验可被 DNS rebinding 绕过（Host 当信任锚） | 加 Host 白名单（实测 evil Host → 403） |
| \`/api/settings\` 可写任意键，绕过下载目录校验 | 键白名单 + downloadDir 独立校验（坏路径 400） |
| \`/api/stream\` 用裸 \`urlCache.set\` 绕过 LRU 上限 | 改用 \`cacheSet\` |
| QQ Cookie 对搜索/详情/歌词完全无效 | \`api()\` 改用动态 cookie |
| 缓存无法从外部失效，重试拿回同一条死链 | \`force=1\` 全链路支持 |

**前端**

| 问题 | 修法 |
|---|---|
| 搜索结果迟到会覆盖用户已切换的视图 | \`__viewToken\` 令牌，4 处 async 渲染加守卫 |
| 播放失败的自动跳歌会抢走用户刚点的歌 | 加 \`playToken\` 守卫 |
| 8 处 \`await api()\` 无 catch，失败变成顶部红条 | 全部补 try/catch + 友好提示 |
| 下载文件名未 \`esc()\` 就拼进 innerHTML | 补转义 |
| 导入歌单无重入锁，连按回车生成两份 | \`state.__importing\` |
| 设置面板切音质不重载当前歌 | 改为 \`reloadCurrent\` |
| 设置面板 select 是原生控件 | 补 \`enhanceSelect\` |

**手机端**

| 问题 | 修法 |
|---|---|
| LocalProxy 异常时 \`active\` 泄漏 + 客户端永久挂死 | 异常路径回退计数 + 池/看门狗局部快照 |
| LocalProxy 客户端断开时上游连接从不 disconnect | \`finally\` 统一收尾（实测 4/4 中断都漏） |
| LocalProxy \`getPort()\` 自愈遗弃旧线程池 | 先 \`shutdownNow\` + \`active.set(0)\` |
| **LyricWindow 在 JS 桥线程操作 UI → 桌面歌词 100% 打不开** | 全部切主线程（Handler + CountDownLatch） |
| 网易云分支白跑一次 probe 然后无条件 throw | 删死代码（顺带消除 28 秒同步阻塞） |
| \`ensureScripts\` 一次失败后整场会话不再重试 | 复位 \`scriptsLoading\` + \`ready\` 判据加 \`scripts.size\` |

**构建链**

- \`build-all.cjs\`：版本单一来源 + 自动归档 + 每步断言
- \`build-installer.ps1\`：纯 ASCII（PS 5.1 会按 ANSI 读中文，之前把 \`留声\` 读成 \`鐗堟湰\`）
- \`finalize-installer.cjs\`：Node 改名 + 解包校验
- payload 排除 \`style.css.bak\` 与 \`sources/raw/\`（省 1.3 MB 无用文件）

### 验证

\`\`\`
selfcheck-all.cjs        11 套件 / 151 断言   全过
  ├ 服务端全量回归        36/36
  ├ 检查更新实现          19/19
  ├ 第六轮 5 项           13/13
  ├ 写方法修复            30/30
  ├ APK 归档校验          29/29
  ├ 打包产物一致性        24/24
  ├ CSS 布局计算          10 个视口
  ├ APK 内容              30/30
  ├ 安装包内容            26/26
  ├ LAN Origin            通过
  └ 检查更新实测          通过

第六轮服务端实测         12/12
P0-1 写盘重试实测        通过
P0-2 zip 编码探针        通过（.NET ZipArchive 能解出 留声.exe）
P0-3 旧包拦截反向测试    通过（6 失败 exit=1）

产物一致性
  安装包 38 个源文件逐字节一致，无缺无余
  APK   13 个文件逐字节一致
  版本  1.0.29 / versionCode 18 / server health 1.0.29
\`\`\`

### 仍未修（约 50 条 P2/P3）

QQ Cookie 的显示、\`mapSong\` 畸形数据防御、\`/api/sources/import\` 重定向上限、
手机端下载断点续传、\`music-libs.cached()\` 缓存 rejected promise、
一批死 CSS 选择器、卸载器用 DefaultDir、外壳不核对后台版本等。

明细在 \`REPORT-v6.md\`。都不影响主流程。
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

  /* 回读确认附件 */
  const chk = await api('GET', '/repos/' + O + '/' + R + '/releases/' + rel.body.id + '/assets')
  if (Array.isArray(chk.body)) {
    console.log('\n回读附件: ' + chk.body.length + ' 个')
    chk.body.forEach((a) => console.log('  ' + a.name + '  ' + (a.size / 1048576).toFixed(2) + ' MB'))
    if (chk.body.length !== 2) upFail++
  }

  if (upFail) { console.log('\n✗ 有 ' + upFail + ' 个问题'); process.exitCode = 1 }
  else console.log('\n✓ 完成')
})()