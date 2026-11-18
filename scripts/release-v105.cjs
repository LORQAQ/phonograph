'use strict'
/* 创建 v1.0.5 Release 并上传 APK（UTF-8 编码） */
const https = require('node:https')
const fs = require('node:fs')

const TOKEN = process.env.GITHUB_TOKEN || ''

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
    if (data) req.write(data)
    req.end()
  })
}

const RELEASE_BODY = [
  '## 手机端修复（按代码审查报告）',
  '',
  '### B1 导入歌单必然失败',
  '',
  '原来 `preview` 和 `import` 在函数开头被统一 `return await importPlaylistMobile(...)`，返回 `{platform, name, songs, skipped}`。前端读 `d.playlists` 和 `d.imported` 全是 undefined，随后 `d.imported.id` 抛异常。后面那段正确的 import 逻辑永远执行不到。',
  '',
  '修复：preview 返回 `{preview, songs}`，import 落库后返回 `{playlists, imported}`。',
  '',
  '### B2 加入/移除歌单静默失效',
  '',
  '后端读 `body.id` / `body.songId`，前端发的是 `listId` / `id`，`find()` 返回 undefined，函数原样返回不报错。',
  '',
  '修复：兼容 `body.listId || body.id`、`body.songId || body.song.id`，新增 `remove` 分支，去重键改为 `source|id`。',
  '',
  '### B8 重载全部音源无效',
  '',
  '`this.loading` 保存首次 `loadAll` 的 Promise 且成功后不清空，后续 `reload()` 直接返回旧 Promise。',
  '',
  '修复：完成后 `this.loading = null`。',
  '',
  '### B9 被禁用的音源仍会被使用',
  '',
  '`resolve()` 不检查 `this.disabled`，`toggle` 只影响列表展示。',
  '',
  '修复：resolve 入口过滤 `this.disabled`。',
  '',
  '### B18 /api/stream 语义不一致',
  '',
  '桌面端返回音频流，手机端返回 JSON 地址。虽然前端未调用，但是个陷阱。',
  '',
  '修复：手机端删除该路由。',
  '',
  '### B24 音源日志永远为空',
  '',
  '`LxScript` 构造时未定义 `logs`，管理页读取 `s.logs` 得到 undefined。',
  '',
  '修复：构造函数补 `this.logs = []`。',
  '',
  '---',
  '',
  '## 未修复（留待后续）',
  '',
  '- S1 监听 0.0.0.0 零鉴权（涉及局域网模式设计）',
  '- S2 音源脚本非沙箱（第三方混淆代码，无法审计）',
  '- E2 两份 app.js 合并（结构性改造）',
  '- 其余 P2/P3 见报告',
].join('\n')

;(async () => {
  console.log('=== 创建 Release v1.0.5 ===')
  const rel = await api('POST', '/repos/LORQAQ/phonograph/releases', {
    tag_name: 'v1.0.5',
    name: '留声 1.0.5',
    body: RELEASE_BODY,
    draft: false,
    prerelease: false,
  })
  if (rel.status !== 201) {
    console.log('  失败 status=' + rel.status + ' ' + JSON.stringify(rel.body).slice(0, 200))
    return
  }
  console.log('  成功 ' + rel.body.tag_name + ' ID=' + rel.body.id)

  /* 上传 APK */
  console.log('\n=== 上传 APK ===')
  const apkPath = 'C:/Users/Administrator/Desktop/留声-1.0.5.apk'
  const apk = fs.readFileSync(apkPath)
  const uploadUrl = '/uploads/releases/' + rel.body.id + '/assets'
  await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'uploads.github.com',
      path: uploadUrl + '?name=' + encodeURIComponent('Liusheng-1.0.5.apk'),
      method: 'POST',
      headers: {
        'User-Agent': 'phonograph',
        Authorization: 'token ' + TOKEN,
        'Content-Type': 'application/octet-stream',
        'Content-Length': apk.length,
      },
      timeout: 300000,
    }, (res) => {
      let d = ''
      res.on('data', (c) => { d += c })
      res.on('end', () => {
        try {
          const j = JSON.parse(d)
          console.log('  ' + (j.size / 1024).toFixed(0) + ' KB')
          console.log('  ' + j.browser_download_url)
        } catch (e) { console.log('  响应: ' + d.slice(0, 200)) }
        resolve()
      })
    })
    req.on('error', reject)
    req.write(apk)
    req.end()
  })

  console.log('\n完成')
})()
