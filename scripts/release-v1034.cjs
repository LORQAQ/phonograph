'use strict'
/* 发布 v1.0.34：网易云音质修复 */
const https = require('node:https')
const fs = require('node:fs')
const path = require('node:path')
process.chdir(path.resolve(__dirname, '..'))

const T = process.env.GITHUB_TOKEN || ''
const O = 'LORQAQ'
const R = 'phonograph'
const VER = '1.0.34'
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

let fail = 0
function up (id, f, n) {
  return new Promise((res) => {
    if (!fs.existsSync(f)) { console.log('  ✗ 不存在: ' + f); fail++; return res() }
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
          if (j.browser_download_url) {
            const okSize = Math.abs(j.size - d.length) < 1024
            console.log('  ' + (okSize ? '✓' : '✗') + ' ' + n + '  ' + (j.size / 1048576).toFixed(2) + ' MB')
            console.log('     ' + j.browser_download_url)
            if (!okSize) fail++
          } else { console.log('  ✗ ' + n + ' ' + JSON.stringify(j).slice(0, 140)); fail++ }
        } catch (e) { console.log('  ✗ ' + n + ' ' + s.slice(0, 90)); fail++ }
        res()
      })
    })
    r.on('error', (e) => { console.log('  ✗ ' + n + ' ' + e.message); fail++; res() })
    r.write(d)
    r.end()
  })
}

const L = []
const P = (s) => L.push(s)
P('## 网易云音质改不了一直 128k')
P('')
P('现象：不管选 320k 还是无损，音源标签永远是 `Free listen · 128k`。')
P('')
P('### 电脑版')
P('')
P('`resolveUrl` 是「多个源并发竞速，谁先成功用谁」。')
P('`Free listen` 只支持 128k 但响应最快，所以永远它先赢 ——')
P('后面能出 320k/无损的 `fish_music`、长青、屿溪根本轮不到。')
P('')
P('改成：竞速时不接受低于目标音质的结果当赢家。')
P('')
P('- 达到或超过目标 → 立刻采用')
P('- 低于目标 → 先当备用（取音质最高的那个），继续等更好的源')
P('- 全部结束或超时 → 退回备用')
P('')
P('备用取「最高」而不是「最先」—— 否则请求 flac24bit 而确实没有源能给时，')
P('会退回最先到的 128k，而不是已经拿到的 flac。')
P('')
P('实测 \`/api/url\`（同一首歌）：')
P('')
P('```')
P('请求 128k      → quality=128k    Free listen')
P('请求 320k      → quality=320k    fish_music    ← 修前是 128k')
P('请求 flac      → quality=flac    fish_music    ← 修前是 128k')
P('请求 flac24bit → quality=flac    fish_music    ← 修前是 128k')
P('```')
P('')
P('### 手机版')
P('')
P('同一个病，外加两个自己的问题：')
P('')
P('1. `fish` 的音质列表写死成 `[\'320k\',\'128k\',\'flac\']`，选 flac24bit 也永远拿不到')
P('2. 并发竞速同样是「谁先谁赢」，`freelisten` 128k 照样抢先')
P('3. `api-mobile` 里 `format === \'flac\' ? \'flac\' : quality` 把**下载格式**当成了播放音质 —')
P('   下载格式设成 FLAC 后，所有播放都被强制成 flac，选 320k 也不生效')
P('')
P('三处都改了：目标音质排在最前、竞速按音质判定、播放音质只看 quality。')
P('')
P('### 真机复测（1.0.34 / versionCode 23）')
P('')
P('| 项目 | 结果 |')
P('|---|---|')
P('| 手机：音质选 Hi-Res 24bit | ✓ 标签显示 `fish_music · flac24bit` |')
P('| 手机：播放 | ✓ 正常，进度前进 |')
P('| 手机：歌词面板 | ✓ 正常 |')
P('| 电脑：`/api/url` 四档音质 | ✓ 均返回正确档位（见上表）|')
P('')
P('电脑版的音源标签读的就是这个 `quality` 字段，所以会跟着变。')

;(async () => {
  const ref = await api('GET', '/repos/' + O + '/' + R + '/git/ref/heads/main')
  console.log('远程 main: ' + (ref.body && ref.body.object ? ref.body.object.sha.slice(0, 7) : '?'))

  const rel = await api('POST', '/repos/' + O + '/' + R + '/releases', {
    tag_name: 'v' + VER, name: '留声 ' + VER, body: L.join('\n'), draft: false, prerelease: false,
  })
  if (rel.status !== 201) { console.log('创建失败 ' + rel.status + ' ' + JSON.stringify(rel.body).slice(0, 200)); process.exitCode = 1; return }
  console.log('Release ' + rel.body.tag_name + ' ID=' + rel.body.id)

  const home = process.env.USERPROFILE || 'C:/Users/Administrator'
  await up(rel.body.id, path.join(home, 'Desktop', '留声-' + VER + '-安装包.exe'), 'Liusheng-' + VER + '-Setup.exe')
  await up(rel.body.id, path.join(home, 'Desktop', '留声-' + VER + '.apk'), 'Liusheng-' + VER + '.apk')

  const chk = await api('GET', '/repos/' + O + '/' + R + '/releases/' + rel.body.id + '/assets')
  if (Array.isArray(chk.body)) {
    console.log('\n回读附件: ' + chk.body.length + ' 个')
    chk.body.forEach((a) => console.log('  ' + a.name + '  ' + (a.size / 1048576).toFixed(2) + ' MB'))
    if (chk.body.length !== 2) fail++
  }
  console.log(fail ? '\n✗ ' + fail + ' 个问题' : '\n✓ 完成')
  if (fail) process.exitCode = 1
})()