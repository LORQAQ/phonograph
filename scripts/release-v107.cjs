'use strict'
/* 创建 v1.0.7 Release（手机端三处修复）+ 上传 APK */
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
  '## 手机端三处修复',
  '',
  '### 1. 酷狗歌单导入',
  '',
  '`importPlaylistMobile` 里根本没有 `kg` 分支，导入酷狗歌单一律抛「无法识别」或走到最后直接报错。',
  '',
  '修复：用实测可用的 `mobilecdn.kugou.com` 接口。',
  '',
  '```',
  'GET /api/v3/special/info?specialid=xxx&format=json     → 歌单名',
  'GET /api/v3/special/song?specialid=xxx&page=1&pagesize=100&format=json  → 歌曲列表',
  '```',
  '',
  '需要 `insecure: true` 跳过证书校验。分页拉取最多 5 页（500 首）。',
  '',
  '顺带清理了原来重复的 kg 代码块（`const songs` 重复声明会导致语法错误）。',
  '',
  '### 2. 移动端没有返回按钮',
  '',
  '之前改「顶栏两行布局」时写了一条 `.nav-history { display: none }`，把返回/前进按钮藏了。结果进了歌单详情、搜索页就没法回上一级。',
  '',
  '修复：',
  '',
  '```css',
  '@media (max-width: 860px) {',
  '  .nav-history { display: flex !important; gap: 6px; }',
  '  .nav-history .nav-btn.home { display: none; }  /* 主页按钮占地方 */',
  '  .nav-history svg { width: 16px; height: 16px; }',
  '}',
  '```',
  '',
  '`navPush` / `navGo` / `navUpdate` 本来就是好的（60 层栈 + 前进后退），只是按钮被藏了。',
  '',
  '### 3. 推荐歌单打开不显示',
  '',
  '`renderRecommendView` 先渲染 10 个骨架屏，然后 `loadRecPage(true)` 异步拉数据。如果接口失败，骨架屏就留在那儿不动 —— 看起来像「打开了但什么都没有」。',
  '',
  '修复：`loadRecPage` 的 catch 分支里，列表为空时把错误信息写进网格：',
  '',
  '```js',
  'catch (e) {',
  '  if (!recState.list.length) grid.innerHTML = `<div class="empty" style="grid-column:1/-1">${esc(e.message)}</div>`',
  '  recState.done = true',
  '}',
  '```',
  '',
  '现在失败会显示具体原因，而不是一片空白。',
].join('\n')

;(async () => {
  console.log('=== 创建 Release v1.0.7 ===')
  const rel = await api('POST', '/repos/' + OWNER + '/' + REPO + '/releases', {
    tag_name: 'v1.0.7',
    name: '留声 1.0.7',
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
  await upload(rel.body.id, 'C:/Users/Administrator/Desktop/留声-1.0.7.apk', 'Liusheng-1.0.7.apk')
  await upload(rel.body.id, 'C:/Users/Administrator/Desktop/留声-1.0.6-安装包.exe', 'Liusheng-1.0.6-Setup.exe')

  console.log('\n完成')
})()
