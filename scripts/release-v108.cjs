'use strict'
/* 创建 v1.0.8 Release 并上传 APK */
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
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(d) }) } catch (e) { resolve({ status: res.statusCode, body: d }) } })
    })
    r.on('error', reject)
    if (data) r.write(data)
    r.end()
  })
}

function upload (releaseId, file, name) {
  return new Promise((resolve) => {
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
            console.log('  ✗ ' + name + ' status=' + res.statusCode)
          }
        } catch (e) { console.log('  ✗ ' + name) }
        resolve()
      })
    })
    r.on('error', () => resolve())
    r.write(data)
    r.end()
  })
}

const BODY = [
  '## 手机端累积修复',
  '',
  '### 酷狗歌单（已修）',
  '',
  '`importPlaylistMobile` 里没有 `kg` 分支，导入一律失败。',
  '',
  '用实测可用的接口：',
  '',
  '```',
  'mobilecdn.kugou.com/api/v3/special/info?specialid=xxx',
  'mobilecdn.kugou.com/api/v3/special/song?specialid=xxx&page=1&pagesize=100',
  '```',
  '',
  '需要 `insecure: true` 跳过证书。实测 417 首。',
  '',
  '### 酷狗封面（已修）',
  '',
  '`stdmusic/{hash}.jpg` 返回的是黑胶默认图，不是专辑封面。',
  '',
  '正确来源是 `trans_param.union_cover`（电脑端 `kugou.js` 的 `coverOf` 就是这么拿的）：',
  '',
  '```',
  'http://imge.kugou.com/stdmusic/{size}/20240718/20240718171603151079.jpg',
  '```',
  '',
  '实测 3/3 拿到真实封面。',
  '',
  '### 移动端返回按钮（已修）',
  '',
  '之前改「顶栏两行布局」时写了 `.nav-history { display: none }`，把返回/前进按钮藏了。',
  '',
  '改成 `@media (max-width: 860px) { .nav-history { display: flex } }`，隐藏主页按钮省空间。',
  '',
  '### 推荐歌单（已修）',
  '',
  '`loadRecPage` 失败时骨架屏不动，看起来像空白。catch 里补错误提示。',
  '',
  '### 进度条拖动（已修，视觉仍偏细）',
  '',
  '`bindProgress` 只绑了 `mousedown/mousemove/mouseup`，手机上拖不动。',
  '',
  '改用 Pointer Events（`pointerdown/move/up` + `setPointerCapture`），同时兼容鼠标、触摸、笔。',
  '',
  '点击热区用 `.progress::before` 上下扩 14px（不占布局）。',
  '',
  '底色从 `#dfe5db` 加深到 `rgba(40,50,40,.2)`，进度点 13px 常显带描边。',
  '',
  '**已知限制**：`.progress-row` 在窄屏下被 flex 挤成 2px 高，视觉上仍不够明显。要彻底解决需要把进度条挪出 `.controls` 独立成行，这次没做。',
  '',
  '---',
  '',
  '### 两次改错的记录',
  '',
  '第一次给 `.progress` 加 `padding: 13px 0` → 撑破这一行，挤掉歌名。',
  '',
  '第二次把 `.player` 改成 `flex-direction: column` → 整个播放器错乱，进度条飞到状态栏。',
  '',
  '都已回滚（`git checkout`），最终只保留 `.progress::before` 一条规则，不碰任何布局属性。',
].join('\n')

;(async () => {
  console.log('=== 创建 Release v1.0.8 ===')
  const rel = await api('POST', '/repos/' + OWNER + '/' + REPO + '/releases', {
    tag_name: 'v1.0.8',
    name: '留声 1.0.8',
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
  await upload(rel.body.id, 'C:/Users/Administrator/Desktop/留声-1.0.7.apk', 'Liusheng-1.0.8.apk')
  await upload(rel.body.id, 'C:/Users/Administrator/Desktop/留声-1.0.6-安装包.exe', 'Liusheng-1.0.6-Setup.exe')

  console.log('\n完成')
})()
