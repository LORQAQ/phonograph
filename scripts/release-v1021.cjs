'use strict'
/* 创建 v1.0.21 Release */
const https = require('node:https')
const fs = require('node:fs')

const TOKEN = process.env.GITHUB_TOKEN || ''
const OWNER = 'LORQAQ'
const REPO = 'phonograph'
if (!TOKEN) { console.log('缺 token'); process.exit(1) }

function api (method, p, body) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body), 'utf8') : null
    const r = https.request({
      hostname: 'api.github.com', path: p, method,
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
    if (!fs.existsSync(file)) { console.log('  ✗ 不存在: ' + file); return resolve() }
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
      timeout: 900000,
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
        } catch (e) { console.log('  ✗ ' + name + ' ' + d.slice(0, 100)) }
        resolve()
      })
    })
    r.on('error', (e) => { console.log('  ✗ ' + name + ' ' + e.message); resolve() })
    r.write(data)
    r.end()
  })
}

const BODY = `## 第四轮自检修复

3 个独立审查员 + 自检脚本，所有结论经实测复现。

### P0-1 缓存写入多包一层 → 同一首歌播第二次失败

\`\`\`
cacheSet(urlCache, cacheKey, { value: payload, exp: ... }, 5*60e3, 300)
                              ^^^^^^^^^^^^^^^^^^^^^^^^ 多余
cacheSet 自己会包 { value, exp } → 存成 { value: {value,exp}, exp }
\`\`\`

实测：
\`\`\`
1st /api/url → {"id":...,"url":"http://fs...mp3"}
2nd /api/url → {"cached":true,"value":{...},"exp":...}   ← 没有 url
/api/stream  → HTTP 502
\`\`\`

修复后：\`第 1 次 226ms / 第 2 次 3ms 都有 url；stream 两次都 200\`

### P0-2 Origin:null 放行 + 写接口不校验 Content-Type

沙箱 iframe 的 Origin 就是 \`null\`，任意网页都能造。配合 \`text/plain\`（CORS 简单请求，不发预检）：

\`\`\`
POST /api/settings   Origin:null + text/plain + {...} → 200（生效）
POST /api/sources/import Origin:null + text/plain     → 400「缺少脚本内容」
    （400 而不是 403，说明已越过守卫，只差一个 url 参数就是 RCE）
\`\`\`

修复：\`Origin:null\` 拒绝 + 写接口强制 \`application/json\`（跨站发 JSON 必须过预检，预检会失败）。

### P1-1 备用接口只能顶一页 → 800 首歌单只导入 300 首

\`usedAlt\` 是一次性开关，第 2 页仍先打 \`song_v2\`，失败就 \`break\`。

修复：把「用哪个接口」做成 \`backend\` 状态机，成功的接口后续页直接复用。
同时终止条件从 \`list.length < pageSize\` 改成「本页有无新增有效歌曲」。

### P1-2 total/truncated 被丢掉

\`fetchGcidPlaylist\` 认真算了 \`truncated\`，但 \`fromKugou\` 只返回 \`{name, cover, songs}\`。
修复：透传，让前端能提示「只取到 N/M 首」。

### P1-3 remark 覆盖歌名 → 《勋章》变成「《我是证人》电影主题曲」

\`remark\` 不是「中文名」，是任意备注：

\`\`\`
TYSM - Normal No More (Explicit) → 不再普普通通
鹿晗 - 勋章                       → 《我是证人》电影主题曲   ← 歌名没了
\`\`\`

修复：原名保留，备注进 \`alias\`。

### P1-4 LocalProxy 重启竞态（实测 190/200 次命中）

\`stop() → start()\` 后旧 accept 线程对着新 socket 继续 accept，退出时
\`finally { acceptorAlive=false; port=0 }\` 把新代理状态抹掉
→ \`proxyUrl()\` 返回空 → 静默直连 → 防盗链 403。

**这就是「点了不播放」的根源。**

修复：加代际标记 \`gen\`，acceptor 只在自己那代有效时才清状态。

### P2（12 项）

- \`request()\` 用 \`Buffer.concat\` 整体解码（\`d += chunk\` 会把跨 TCP 分片的中文切成 U+FFFD）
- 歌单封面替换 \`{size}\`（不替换是 404 破图）
- 去掉无条件 \`rejectUnauthorized:false\`，改按需
- \`detect()\` 支持裸 \`gcid_xxx\`
- 手机端 gcid 加限流重试（原来写死 clienttime，重试永远是同一个签名请求）
- 手机端透传 truncated
- gcid 大小写统一 / 纯数字不判成 gcid
- \`lyricShow\` 消费返回值
- md5 计算异常不再报成「缺库」
- 空时长不显示 0:00
- \`request()\` 加 8MB 响应上限

### 验证

| 项 | 结果 |
|---|---|
| Java 编译 | ✓ |
| JS 语法（15 文件） | ✓ |
| APK 内容 | 30/30 |
| 安装包内容 | 26/26 |
| 同一首歌二次播放 | 226ms → 3ms |
| /api/stream 二次 | 200 / 200 |
| Origin:null | 403 |
| gcid 全量 | 45 / 45 |
`

;(async () => {
  console.log('=== 远程分支 ===')
  const ref = await api('GET', '/repos/' + OWNER + '/' + REPO + '/git/ref/heads/main')
  console.log('  main = ' + (ref.body && ref.body.object ? ref.body.object.sha.slice(0, 7) : '?'))

  console.log('\n=== 创建 Release v1.0.21 ===')
  const rel = await api('POST', '/repos/' + OWNER + '/' + REPO + '/releases', {
    tag_name: 'v1.0.21',
    name: '留声 1.0.21',
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
  await upload(rel.body.id, 'C:/Users/Administrator/Desktop/留声-1.0.21-安装包.exe', 'Liusheng-1.0.21-Setup.exe')
  await upload(rel.body.id, 'C:/Users/Administrator/Desktop/留声-1.0.21.apk', 'Liusheng-1.0.21.apk')

  console.log('\n完成')
})()
