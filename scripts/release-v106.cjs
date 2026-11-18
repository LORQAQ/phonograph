'use strict'
/* 创建 v1.0.6 Release 并上传安装包 */
const https = require('node:https')
const fs = require('node:fs')

const TOKEN = process.env.GITHUB_TOKEN || ''
const OWNER = 'LORQAQ'
const REPO = 'phonograph'

if (!TOKEN) { console.log('缺少 token'); process.exit(1) }

function api (method, p, body) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body), 'utf8') : null
    const req = https.request({
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
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

function upload (releaseId, file, name) {
  return new Promise((resolve) => {
    const data = fs.readFileSync(file)
    const req = https.request({
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
        } catch (e) { console.log('  ✗ ' + name + ' 响应解析失败: ' + d.slice(0, 100)) }
        resolve()
      })
    })
    req.on('error', (e) => { console.log('  ✗ ' + name + ' ' + e.message); resolve() })
    req.write(data)
    req.end()
  })
}

const BODY = [
  '## 桌面端按 BUG-REPORT 修复 P0/P1',
  '',
  '### B3 切歌竞态',
  '',
  '`streamSrc` 是异步的，`await` 回来后没校验 token 就赋值，快速连续点歌会播放上一首。',
  '',
  '修复：回来时校验 `token !== state.playToken` 就丢弃。',
  '',
  '### B4 取流失败赋空 src',
  '',
  '给 `audio.src` 赋空字符串等于把 URL 设为当前页面地址，控制台报 `no supported source`，还会发一次对 index.html 的请求。',
  '',
  '修复：空值改走 `audio.removeAttribute(\'src\')`。',
  '',
  '### B5 关闭丢失最后修改',
  '',
  '`saveDb` 有 300ms 防抖，`/api/shutdown` 150ms 后就 `exit(0)`，窗口期内的修改丢失。',
  '',
  '修复：退出前 `clearTimeout(saveTimer)` + `writeDbNow()` 同步落盘，延迟改 300ms。',
  '',
  '### B6 db 非原子写',
  '',
  '`writeFileSync` 直接覆盖，崩溃/断电会写坏；`loadDb` 解析失败返回 `{}`，用户数据无声消失。',
  '',
  '修复：先写 `.tmp` 再 `rename`；解析失败时备份为 `.bak` 并打日志。',
  '',
  '### B10 下载列表文件删不掉',
  '',
  '列表扫描 3 个目录，删除只认 `settings.downloadDir`；`startsWith` 不是严格边界；不校验扩展名。',
  '',
  '修复：遍历 3 个候选目录，`path.relative` 判断逃逸，限制音频扩展名白名单。',
  '',
  '### B23 歌单去重只比较 id',
  '',
  '不同平台相同 id 的歌曲被误判为重复。',
  '',
  '修复：去重键改为 `source + id`。',
  '',
  '### S1 监听 0.0.0.0 零鉴权',
  '',
  '局域网内任意设备可读歌单/Cookie、改下载目录、删除文件。',
  '',
  '修复：默认绑 `127.0.0.1`；要开局域网设环境变量 `PHONOGRAPH_LAN=1`。',
  '',
  '### S4 静态路径边界',
  '',
  '`startsWith(PUBLIC)` 会被 `public2/` 这类兄弟前缀绕过。',
  '',
  '修复：改用 `path.relative` 判断。',
  '',
  '---',
  '',
  '### 校验 14/14',
  '',
  '打包后从 exe 内嵌 zip 提取校验，全部通过。',
].join('\n')

;(async () => {
  console.log('=== 创建 Release v1.0.6 ===')
  const rel = await api('POST', '/repos/' + OWNER + '/' + REPO + '/releases', {
    tag_name: 'v1.0.6',
    name: '留声 1.0.6',
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
  await upload(rel.body.id, 'C:/Users/Administrator/Desktop/留声-1.0.6-安装包.exe', 'Liusheng-1.0.6-Setup.exe')
  await upload(rel.body.id, 'C:/Users/Administrator/Desktop/留声-1.0.5.apk', 'Liusheng-1.0.5.apk')

  console.log('\n完成')
})()
