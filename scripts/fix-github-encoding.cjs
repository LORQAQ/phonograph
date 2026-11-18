'use strict'
/* 用 UTF-8 正确编码更新 GitHub 仓库描述和 Release 说明 */
const https = require('node:https')

const TOKEN = process.env.GITHUB_TOKEN || ''
const OWNER = 'LORQAQ'
const REPO = 'phonograph'

function api (method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body), 'utf8') : null
    const req = https.request({
      hostname: 'api.github.com',
      path,
      method,
      headers: Object.assign({
        'User-Agent': 'phonograph',
        Authorization: 'token ' + TOKEN,
        Accept: 'application/vnd.github+json',
      }, data ? { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': data.length } : {}),
      timeout: 30000,
    }, (res) => {
      let d = ''
      res.on('data', (c) => { d += c })
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }) } catch (e) { resolve({ status: res.statusCode, body: d }) }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
    if (data) req.write(data)
    req.end()
  })
}

;(async () => {
  /* 1) 仓库描述 */
  console.log('=== 更新仓库描述 ===')
  const r1 = await api('PATCH', '/repos/' + OWNER + '/' + REPO, {
    description: '留声 Phonograph — 类落雪音乐的三平台音乐播放器（Windows + Android），支持网易云 / QQ音乐 / 酷狗',
  })
  console.log('  status ' + r1.status)
  console.log('  描述: ' + (r1.body && r1.body.description))

  /* 2) Release v1.0.4 说明 */
  console.log('\n=== 更新 Release v1.0.4 ===')
  const body = [
    '## 终于修好了播放',
    '',
    '### 根因',
    '',
    '`/api/stream` 直接调 `sourceManager.resolveUrl`，缺少三样东西：',
    '',
    '1. `await loadPromise` —— 音源还没就绪就开始取流',
    '2. `resolveWithCross` —— 没有跨平台兜底',
    '3. `urlCache` —— 没有缓存',
    '',
    '而 `/api/url` 是完整的。所以凡是前端走 `/api/stream` 代理播放的歌，全部 500。',
    '',
    '### 修复',
    '',
    '把 `/api/stream` 改成与 `/api/url` 同一条路径。',
    '',
    '### 实测',
    '',
    '```',
    '33911781   -> 13.4 MB  200 OK  ID3',
    '1803908863 ->  7.9 MB  200 OK  ID3',
    '1338274844 -> 12.6 MB  200 OK  ID3',
    '```',
    '',
    '三首都是完整 MP3，文件头 `49 44 33` 是标准的 ID3 标识。',
    '',
    '### 其他修复',
    '',
    '- 修复 `Cannot set properties of null` 页面错误（17 处 fallback + 4 处 if 守卫）',
    '- 外链过滤：网易云 `song/media/outer` 是 302 占位，直接判无效',
    '- 残缺检测：拿到时长低于原曲 85% 时自动换平台',
    '- 歌词当前行放大 1.26em 加粗',
  ].join('\n')

  const rel = await api('GET', '/repos/' + OWNER + '/' + REPO + '/releases/tags/v1.0.4')
  if (rel.body && rel.body.id) {
    const r2 = await api('PATCH', '/repos/' + OWNER + '/' + REPO + '/releases/' + rel.body.id, { body })
    console.log('  status ' + r2.status)
    console.log('  说明长度: ' + (r2.body && r2.body.body ? r2.body.body.length : 0))

    /* 3) 顺便修 v1.0.3 的名字 */
    const r3 = await api('PATCH', '/repos/' + OWNER + '/' + REPO + '/releases/' + rel.body.id, { name: '留声 1.0.4' })
    console.log('  标题: ' + (r3.body && r3.body.name))
  }

  /* 4) v1.0.3 也修一下 */
  console.log('\n=== 更新 v1.0.3 ===')
  const rel3 = await api('GET', '/repos/' + OWNER + '/' + REPO + '/releases/tags/v1.0.3')
  if (rel3.body && rel3.body.id) {
    const r4 = await api('PATCH', '/repos/' + OWNER + '/' + REPO + '/releases/' + rel3.body.id, {
      name: '留声 1.0.3',
      body: '## 修复页面错误\n\n- 修复 `Cannot set properties of null`（17 处 fallback + 4 处 if 守卫）\n- 完整错误堆栈输出到错误条\n- 外链过滤 + 残缺检测 + 歌词放大',
    })
    console.log('  status ' + r4.status)
  }

  /* 5) v1.0.2 */
  console.log('\n=== 更新 v1.0.2 ===')
  const rel2 = await api('GET', '/repos/' + OWNER + '/' + REPO + '/releases/tags/v1.0.2')
  if (rel2.body && rel2.body.id) {
    const r5 = await api('PATCH', '/repos/' + OWNER + '/' + REPO + '/releases/' + rel2.body.id, {
      name: '留声 1.0.2',
      body: '## 电脑端补齐修复\n\n- 外链过滤（网易云 302 占位判定无效）\n- 残缺检测（时长 < 85% 原长自动换平台）\n- 歌词当前行放大\n\n## 手机端\n\n- 移除 APK 内重复的 assets/www 嵌套目录，体积 1271KB -> 678KB',
    })
    console.log('  status ' + r5.status)
  }

  /* 6) v1.0.1 */
  console.log('\n=== 更新 v1.0.1 ===')
  const rel1 = await api('GET', '/repos/' + OWNER + '/' + REPO + '/releases/tags/v1.0.1')
  if (rel1.body && rel1.body.id) {
    const r6 = await api('PATCH', '/repos/' + OWNER + '/' + REPO + '/releases/' + rel1.body.id, {
      name: '留声 1.0.1',
      body: '## 首个版本\n\n### 电脑端\n- WinForms + WebView2 外壳，本地 Node 服务（21 个 API）\n- 三平台搜索播放下载\n- 下载管理与格式选择\n- 歌词滚动高亮 / 桌面歌词\n\n### 手机端\n- WebView + 原生 HTTP 桥\n- 6 个音源（fish 优先）\n- 播放页歌词跟随\n- 歌单导入',
    })
    console.log('  status ' + r6.status)
  }

  console.log('\n完成')
})()
