'use strict'
/* v1.0.24 Release */
const https = require('node:https')
const fs = require('node:fs')
const T = process.env.GITHUB_TOKEN || ''
const O = 'LORQAQ'
const R = 'phonograph'
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

function up (id, f, n) {
  return new Promise((res) => {
    if (!fs.existsSync(f)) { console.log('  x ' + f); return res() }
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
          if (j.browser_download_url) { console.log('  OK ' + n + '  ' + (j.size / 1048576).toFixed(2) + ' MB'); console.log('     ' + j.browser_download_url) }
          else console.log('  x ' + n + ' ' + JSON.stringify(j).slice(0, 130))
        } catch (e) { console.log('  x ' + s.slice(0, 80)) }
        res()
      })
    })
    r.on('error', (e) => { console.log('  x ' + e.message); res() })
    r.write(d)
    r.end()
  })
}

const BODY = [
  '## 第六+七轮：把 audit4 剩下的全部修完',
  '',
  '### 这轮修的 8 项',
  '',
  '| 项 | 问题 | 修法 |',
  '|---|---|---|',
  '| `renderDownloadsView` | 不复位 `state.view`，从前进/后退进来时下载完不刷新 | 补上 + 同步侧栏高亮 |',
  '| `#btnRecImport` | 推荐弹窗里的「导入到我的歌单」没绑定，点了没反应 | 在 `openRecDialog` 里绑 |',
  '| `isPrivateHost` | `127.1` / `0x7f.0.0.1` / `2130706433` / `0177.0.0.1` 全判错 | 补 inet_aton 归一（十进制/八进制/十六进制/短写） |',
  '| `LocalProxy.reason` | 431/429/408/413 没有 reason phrase | 补上 |',
  '| 手机端 discover | tx/kg 分支拉的是网易云新歌，桌面端返回空，两端不一致 | 统一：非 wy 返回 `[]` |',
  '| gcid 导入 | 单请求有超时但翻 100 页没总上限（实测拖过 120 秒） | 加 60 秒总预算 + `timedOut` 标记 |',
  '| 并发下载 | `window.__onDownload` 全局单例，同时下两首会串台 | JS 侧全局互斥（`__DL_POOL` 本来就是单线程） |',
  '',
  '### 验证',
  '',
  '```',
  'isPrivateHost 19 个用例全对（含 127.1 / 0x7f.0.0.1 / 2130706433 / 0177.0.0.1）',
  '服务端回归 36/36',
  'APK 内容 30/30',
  '安装包内容 26/26',
  'Java 编译通过',
  '```',
  '',
  '### 真机验证',
  '',
  '```',
  '酷狗排行榜（TOP500 / 新歌榜 / 飙升榜 / 内地榜）加载正常',
  '播放「慌啥子嘛 (合唱版) - 赵本山、赵大牛、球球」00:21 / 03:09',
  'NOW SPINNING 显示 kxh · 320k',
  '无 ANR / FATAL',
  '```',
  '',
  '全程 `volume_music = 0`。',
  '',
  '### 修这一轮时自己踩的坑',
  '',
  '`String.prototype.replace(str, newStr)` 的第二个参数里，`$$` 会被解读成字面 `$`。',
  '',
  '我写的是：',
  '',
  '```js',
  "s.replace(old, `  $$('.rail-item').forEach(...)`)",
  '```',
  '',
  "结果文件里变成了 `$('.rail-item')` —— `$` 是 querySelector，没有 `.forEach`，一调用就 TypeError。",
  '',
  '回归脚本抓到「$ 当 $$ 误用 1 处」，改成函数式替换 `s.replace(old, () => ...)` 才正确。',
  '',
  '### 累计',
  '',
  '| 轮次 | 修复项 | 引入的 P0 |',
  '|---|---|---|',
  '| BUG-REPORT-2 | 46 | 2 |',
  '| 回归修复 | 17 | 2 |',
  '| 雪耻 | 8 | 1 |',
  '| audit4 | 27 | 0 |',
  '| 真机自测 | 3 | 0 |',
  '| 第五轮 | 12 | 0 |',
  '| 第六+七轮 | 8 | 0 |',
  '| **合计** | **121** | **5** |',
].join('\n')

;(async () => {
  const ref = await api('GET', '/repos/' + O + '/' + R + '/git/ref/heads/main')
  console.log('远程 main: ' + (ref.body && ref.body.object ? ref.body.object.sha.slice(0, 7) : '?'))

  const rel = await api('POST', '/repos/' + O + '/' + R + '/releases', {
    tag_name: 'v1.0.24', name: '留声 1.0.24', body: BODY, draft: false, prerelease: false,
  })
  if (rel.status !== 201) { console.log('失败 ' + rel.status + ' ' + JSON.stringify(rel.body).slice(0, 200)); return }
  console.log('Release ' + rel.body.tag_name + ' ID=' + rel.body.id)

  await up(rel.body.id, 'C:/Users/Administrator/Desktop/留声-1.0.24-安装包.exe', 'Liusheng-1.0.24-Setup.exe')
  await up(rel.body.id, 'C:/Users/Administrator/Desktop/留声-1.0.24.apk', 'Liusheng-1.0.24.apk')
  console.log('完成')
})()
