'use strict'
/* 发布 v1.0.27 */
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
  '## 全面自检第五轮：2 个 P0 + 8 个 P1',
  '',
  '两个独立审查员 + 9 个自动化验证套件（68 条断言）+ 真机。',
  '',
  '### P0-1 「检查更新」在部分手机上会永久卡死',
  '',
  '国产 ROM 的旧 WebView（Chrome 53 及以下）**没有 `AbortController`**，',
  '15 秒超时整段失效，按钮永远停在「检查中…」，界面锁死，只能重启。',
  '',
  '```js',
  '// 之前：超时完全依赖 signal',
  'const ac = typeof AbortController === "function" ? new AbortController() : null',
  'const to = ac ? setTimeout(() => ac.abort(), 15000) : null   // ← 拿不到就彻底没有超时',
  '```',
  '',
  '改成 `Promise.race` 兜底，`signal` 只作为「能中止就中止」的优化。',
  '',
  '### P0-2 发布物与源码脱节 —— 用户装不到新版',
  '',
  '这个最要命。实测：',
  '',
  '```',
  '留声.apk         versionName=1.0.0  versionCode=1   app.js 含 checkUpdate=false',
  '留声-1.0.7.apk   versionName=1.0.0  versionCode=1   app.js 含 checkUpdate=false',
  'liusheng.apk     versionName=1.0.27 versionCode=16  app.js 含 checkUpdate=true',
  '```',
  '',
  '**根目录的 `留声.apk` 是 11-18 20:01 的包**，用户装的很可能就是这个 ——',
  '第五到七轮的所有手机改动（检查更新、NAPI.openUrl 桥、gcid 全量翻页）都只在 `apk-build/liusheng.apk` 里。',
  '',
  '现在打包后强制归档 + 校验：',
  '',
  '```js',
  'Copy-Item "apk-build/liusheng.apk" "留声.apk" -Force',
  'Copy-Item "apk-build/liusheng.apk" "留声-1.0.27.apk" -Force',
  '// 并解包验证 assets/www/app.js 与 mobile/www/app.js 逐字节一致',
  '```',
  '',
  '### P1 列表',
  '',
  '| 项 | 问题 |',
  '|---|---|',
  '| 1 | 200 + 劫持 HTML 时把英文 JSON 解析错误甩给用户 |',
  '| 2 | `openExternal` 的 `location.href` 兜底是死代码（`window.open` 永远存在） |',
  '| 3 | `downloadSong` 互斥加在 `await` 之后，等于没加，还会永久锁死 |',
  '| 4 | gcid 预算起点错，实际最长 3 分钟 |',
  '| 5 | 截断信息整条链路丢失，用户不知道只导到 300/800 首 |',
  '| 6 | 手机端 gcid 没移植桌面修复，800 首只拿 300 首 |',
  '| 7 | `.lyric-roll .ll` 字号写在媒体查询外，桌面歌词被压小 |',
  '| 8 | CSS 嵌套注释吃掉整条 `will-change` 规则 |',
  '',
  '### 还有一个我自己造成的',
  '',
  '**唱片转速被我上一轮盖成了 8 秒一圈**（原来 1.8 秒 = 33⅓ rpm），',
  '视觉上就是「转不动」。已还原。',
  '',
  '### 验证',
  '',
  '| 套件 | 结果 |',
  '|---|---|',
  '| 服务端全量回归 | 36/36 |',
  '| 检查更新实现 | 19/19 |',
  '| 第六轮 5 项 | 13/13 |',
  '| CSS 布局计算 | 10 个视口全部充裕 |',
  '| APK 内容 | 30/30 |',
  '| 安装包内容 | 26/26 |',
  '| LAN Origin | 通过 |',
  '| 检查更新实测 | 通过 |',
  '| **合计** | **68 条断言** |',
  '',
  '真机（1920×1080，Android 15）：',
  '',
  '```',
  '唱片正圆、不溢出',
  '歌名正确：Normal No More (Explicit) / Run Free (Original Mix) / 勋章 - 鹿晗',
  '播放 00:05 / 03:19',
  '歌词「歌词加载中…」正常',
  '音质可切到 Hi-Res 24bit',
  '全程 volume_music = 0',
  '```',
  '',
  '### 各视口下的黑胶区与歌词区',
  '',
  '| 视口 | 黑胶 | 歌词剩余 |',
  '|---|---|---|',
  '| 1200×678 | 176px | 299px |',
  '| 1204×617 | 136px | 278px |',
  '| 1920×1080 | 280px | 597px |',
  '| 1024×768 | 261px | 304px |',
  '| 915×412（横屏手机） | 115px | 可滚动不裁切 |',
].join('\n')

;(async () => {
  const ref = await api('GET', '/repos/' + O + '/' + R + '/git/ref/heads/main')
  console.log('远程 main: ' + (ref.body && ref.body.object ? ref.body.object.sha.slice(0, 7) : '?'))

  const rel = await api('POST', '/repos/' + O + '/' + R + '/releases', {
    tag_name: 'v1.0.27', name: '留声 1.0.27', body: BODY, draft: false, prerelease: false,
  })
  if (rel.status !== 201) { console.log('失败 ' + rel.status + ' ' + JSON.stringify(rel.body).slice(0, 200)); return }
  console.log('Release ' + rel.body.tag_name + ' ID=' + rel.body.id)

  await up(rel.body.id, 'C:/Users/Administrator/Desktop/留声-1.0.27-安装包.exe', 'Liusheng-1.0.27-Setup.exe')
  await up(rel.body.id, 'C:/Users/Administrator/Desktop/留声-1.0.27.apk', 'Liusheng-1.0.27.apk')
  console.log('完成')
})()
