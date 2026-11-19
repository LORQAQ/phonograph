'use strict'
/* v1.0.23 Release */
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
  '## 第五轮：修完 audit4 剩下的 P2/P3',
  '',
  '### 修了什么',
  '',
  '| 项 | 问题 | 修法 |',
  '|---|---|---|',
  '| 前端 api() | 没有超时，服务端卡住界面永远转圈 | AbortController + 45 秒 |',
  '| 切音质 | 两个 error 监听抢 audio，会连弹两条 toast 还自动跳歌 | `__qualitySwitching` 标志，fallback/onOk/超时三处都清 |',
  '| `#srcBadge` | HTML 里根本没这个元素，`setSrc()` 写进一个假对象 | 补进 index.html |',
  '| 错误码 | `json(res, e.code \\|\\| 500)` 把 `ECONNRESET` 当 HTTP status，响应发不出去 | 转成数字并校验 400-599 |',
  '| `/api/download` | `?save=1` 会落盘却不在写名单 | 加进 WRITE_PATHS |',
  '| flushDb | 失败后永久 3 秒重试，刷爆日志 | 指数退避（1/2/4/8/16/32/60 秒） |',
  '| QQ Cookie | 脱敏后无法清空 | 加 `clearQqCookie: true` 显式语义 |',
  '| gcid 超时 | 实测 preview 拖过 120 秒 | `__kgReq` 20s → 40s（Java 侧 connect 12s + read 20s = 32s） |',
  '',
  '### 真机验证',
  '',
  '`#srcBadge` 修复后真机显示 **`fish_music · 320k`**（之前完全看不到）。',
  '',
  '```',
  '播放「冬天又来啦 - 罗言」00:11 / 02:49',
  'NOW SPINNING 区显示：',
  '  冬天又来临',
  '  罗言',
  '  fish_music · 320k      ← 这就是 #srcBadge',
  '```',
  '',
  '### 验证',
  '',
  '| 项 | 结果 |',
  '|---|---|',
  '| 服务端回归 | 36/36 |',
  '| APK 内容 | 30/30 |',
  '| 安装包内容 | 26/26 |',
  '| Java 编译 | 通过 |',
  '| 真机播放 | 正常 |',
  '',
  '### 仍然没做的',
  '',
  '- gcid 导入链没有总预算（只有单请求超时）',
  '- 并发下载回调没有 id，会串台',
  '- `isPrivateHost` 对 `127.1` / `0x7f.0.0.1` 这类简写判错（有白名单兜底）',
  '- 431 响应没有 reason phrase',
  '- 手机端 tx/kg 的「新歌」区块拉的是网易云数据，桌面端返回空（两端不一致）',
  '- `renderDownloadsView` 不复位 `state.view`（从前进后退进来时下载完不刷新）',
  '- `#btnRecImport` 没有任何绑定（推荐弹窗里的导入按钮点了没反应）',
  '',
  '这些都不影响正常播放。',
].join('\n')

;(async () => {
  const ref = await api('GET', '/repos/' + O + '/' + R + '/git/ref/heads/main')
  console.log('远程 main: ' + (ref.body && ref.body.object ? ref.body.object.sha.slice(0, 7) : '?'))

  const rel = await api('POST', '/repos/' + O + '/' + R + '/releases', {
    tag_name: 'v1.0.23', name: '留声 1.0.23', body: BODY, draft: false, prerelease: false,
  })
  if (rel.status !== 201) { console.log('失败 ' + rel.status + ' ' + JSON.stringify(rel.body).slice(0, 200)); return }
  console.log('Release ' + rel.body.tag_name + ' ID=' + rel.body.id)

  await up(rel.body.id, 'C:/Users/Administrator/Desktop/留声-1.0.23-安装包.exe', 'Liusheng-1.0.23-Setup.exe')
  await up(rel.body.id, 'C:/Users/Administrator/Desktop/留声-1.0.23.apk', 'Liusheng-1.0.23.apk')
  console.log('完成')
})()
