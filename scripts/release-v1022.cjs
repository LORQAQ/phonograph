'use strict'
/* 创建 v1.0.22 Release */
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
    if (!fs.existsSync(file)) { console.log('  x 不存在: ' + file); return resolve() }
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
            console.log('  OK ' + name + '  ' + (j.size / 1048576).toFixed(2) + ' MB')
            console.log('     ' + j.browser_download_url)
          } else {
            console.log('  x ' + name + ' ' + JSON.stringify(j).slice(0, 150))
          }
        } catch (e) { console.log('  x ' + name + ' ' + d.slice(0, 100)) }
        resolve()
      })
    })
    r.on('error', (e) => { console.log('  x ' + name + ' ' + e.message); resolve() })
    r.write(data)
    r.end()
  })
}

const BODY = [
  '## 真机自测修复',
  '',
  '真机（Android 15 / 1080x1920）实测发现 3 个源码审查看不出来的问题。',
  '',
  '### 1. 手机端粘贴裸 gcid 提示「无法识别」',
  '',
  'P2-7 只给电脑端 `playlist-import.js` 的 `detect()` 加了裸 gcid 分支，手机端 `parsePlaylistUrl` 没加。',
  '',
  '```',
  'gcid_3znx57dpz2tz0b7',
  '→ 导入失败：无法识别这个歌单链接，支持网易云 / QQ音乐 / 酷狗',
  '```',
  '',
  '补上并单测 7 个用例（含大写 GCID_、数字 specialid、网易云 id、QQ 链接）。',
  '',
  '### 2. 手机端歌名还是被 remark 覆盖',
  '',
  'P1-3 只改了电脑端，手机端 `__kgMapSong` 还是旧逻辑：',
  '',
  '```',
  '修复前：《我是证人》电影主题曲',
  '修复后：勋章',
  '```',
  '',
  '### 3. 顶部红条显示音源脚本噪音',
  '',
  '`lx-source-freelisten.js:577` 自己 `throw new Error("failed")`，被 `unhandledrejection` 捕获显示成「promise: failed」。',
  '',
  '`index.html` 的 `__NOISE__` 只匹配 message，看不出是音源脚本抛的。改成同时检查 `reason.stack`。',
  '',
  '### 真机验证',
  '',
  '| 项 | 结果 |',
  '|---|---|',
  '| 启动音源加载 | 6/6 |',
  '| 排行榜 | 50 首正常 |',
  '| 播放「冬天又来啦」 | 00:11 / 02:49 |',
  '| 切歌「海屿你」 | 00:09 / 04:55 |',
  '| 酷狗 gcid 导入 | 45 首 |',
  '| 播放「勋章 - 鹿晗」 | 00:13 / 03:33 |',
  '| ANR / FATAL | 无 |',
  '',
  '全程 `volume_music = 0`。',
  '',
  '### 新增测试脚本',
  '',
  '- `scripts/regress-all.cjs` — 服务端 36 项全量回归',
  '- `scripts/regress-frontend2.cjs` — 假 DOM 加载 app.js 实测绑定',
  '- `REALDEVICE-TEST.md` — 真机测试报告',
  '',
  '### 服务端回归（36/36）',
  '',
  '```',
  'SSRF 拦截本机 403',
  'Origin:null 拒绝 403',
  'LAN Origin 放行 200',
  'text/plain 写接口拦截 415',
  'GET download-dir 可读 1ms',
  '取流第 2 次（缓存）0ms',
  '缓存结构正确（无嵌套 value）',
  'Range 请求 206',
  '并发去重 1 个 URL',
  'javac 编译通过',
  '```',
].join('\n')

;(async () => {
  const ref = await api('GET', '/repos/' + OWNER + '/' + REPO + '/git/ref/heads/main')
  console.log('远程 main: ' + (ref.body && ref.body.object ? ref.body.object.sha.slice(0, 7) : '?'))

  console.log('\n创建 Release v1.0.22')
  const rel = await api('POST', '/repos/' + OWNER + '/' + REPO + '/releases', {
    tag_name: 'v1.0.22',
    name: '留声 1.0.22',
    body: BODY,
    draft: false,
    prerelease: false,
  })
  if (rel.status !== 201) {
    console.log('失败 status=' + rel.status + ' ' + JSON.stringify(rel.body).slice(0, 200))
    return
  }
  console.log('  OK ' + rel.body.tag_name + ' ID=' + rel.body.id)

  console.log('\n上传附件')
  await upload(rel.body.id, 'C:/Users/Administrator/Desktop/留声-1.0.22-安装包.exe', 'Liusheng-1.0.22-Setup.exe')
  await upload(rel.body.id, 'C:/Users/Administrator/Desktop/留声-1.0.22.apk', 'Liusheng-1.0.22.apk')

  console.log('\n完成')
})()
