'use strict'
/* 发布 v1.0.26 —— 音源标签 + 唱片椭圆 + 歌词区高度 */
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
  '## 修 3 个布局问题',
  '',
  '### 1. 音源标签太突兀',
  '',
  '`fish_music · 320k` 用的是继承字号（14px 正文大小），夹在歌名和「歌词」之间很扎眼。',
  '',
  '改成跟 `npSinger` 同一档的辅助信息：',
  '',
  '```css',
  '.deck-info .src-badge{',
  '  font-size:10px;           /* 原 14px */',
  '  font-family:var(--mono);',
  '  color:var(--text-3);      /* 三级文字，弱化 */',
  '  opacity:.85;',
  '}',
  '.deck-info .src-badge:empty{display:none}   /* 没音源信息时不占位 */',
  '```',
  '',
  '### 2. 唱片被拉成椭圆并溢出',
  '',
  '**这个是我上一版自己引入的**。加了两条互相打架的规则：',
  '',
  '```css',
  '.vinyl-zone{ max-width:250px }              /* 老规则 */',
  '.vinyl-zone{ max-height:min(32vh,280px) }   /* 新加的 */',
  '```',
  '',
  '`max-width` 和 `max-height` 不同步 → 容器变成 250×280 的矩形 → 里面的唱片跟着被拉伸。',
  '',
  '期间还试过一条更糟的：',
  '',
  '```css',
  '.vinyl-zone > *{ width:100%; height:100%; aspect-ratio:1/1 }',
  '```',
  '',
  '`aspect-ratio` 争不过 `width:100%`，反而让子元素完全按父容器的宽高比拉伸 —— 椭圆更明显。',
  '',
  '**正解：只用一个尺寸源。**',
  '',
  '```css',
  '.vinyl-zone{',
  '  width:100%;',
  '  max-width:min(100%, 34vh);   /* 宽度上限跟着视口高度走 */',
  '  aspect-ratio:1/1;            /* 高度 = 宽度，永远正圆 */',
  '  max-height:none;             /* 显式清掉所有旧的 max-height */',
  '}',
  '```',
  '',
  '同时清掉历史上累积的 8 条 `max-height` 规则（前面几轮反复加过）。',
  '',
  '### 3. 平板模式没有歌词',
  '',
  '同一个根因：黑胶区占掉了几乎全部竖向空间，歌词区被挤成 0。',
  '',
  '按视口高度算了几组：',
  '',
  '| 视口 | 黑胶区 | 歌词剩余 |',
  '|---|---|---|',
  '| 1200×678（平板横屏） | 176px | **299px** |',
  '| 1204×617 | 136px | **278px** |',
  '| 1920×1080 | 280px | **597px** |',
  '| 1024×768 | 261px | **304px** |',
  '| 678×1200（竖屏） | 240px | **757px** |',
  '',
  '同时给歌词区兜底：',
  '',
  '```css',
  '#panelLyric.deck-body{',
  '  flex:1 1 auto;',
  '  min-height:150px;     /* 矮窗口下 130px */',
  '  display:flex;',
  '  flex-direction:column;',
  '}',
  '```',
  '',
  '### 4. 唱片「扭动」',
  '',
  '查了 `@keyframes`，`spin` 只有 `rotate(360deg)`，没有 `scale`/`skew`。',
  '',
  '真正的抖动来源是旋转元素在合成层里被反复重绘 + 父容器高度变化时的 layout 抖动。补了：',
  '',
  '```css',
  '.vinyl, .vinyl-grooves, .vinyl-label{',
  '  will-change:transform;',
  '  backface-visibility:hidden;',
  '  transform-origin:50% 50%;',
  '}',
  '.vinyl.playing{ contain:layout style }   /* 锁住内部 layout，不往外传 */',
  '```',
  '',
  '### 真机验证',
  '',
  '```',
  '1920x1080：唱片正圆、不溢出，歌词显示 4 行',
  '  「录音室Recorded at: Moonbaby Studio」',
  '  「混音Mix: ADE陶兴轩」',
  '  「母带Mastered: ADE陶兴轩」',
  '  「已经习惯有你在我的周围帮我擦掉那颗眼角的泪」',
  '音源标签 fish_music · 320k 显示为小号灰字',
  '音量 0，未出声',
  '```',
  '',
  '### 验证',
  '',
  '| 项 | 结果 |',
  '|---|---|',
  '| APK 内容 | 30/30 |',
  '| 安装包内容 | 26/26 |',
  '| 各视口 CSS 计算 | 歌词区全部 >= 100px |',
  '| 唱片透明度/形状 | 真机确认为正圆 |',
].join('\n')

;(async () => {
  const ref = await api('GET', '/repos/' + O + '/' + R + '/git/ref/heads/main')
  console.log('远程 main: ' + (ref.body && ref.body.object ? ref.body.object.sha.slice(0, 7) : '?'))

  const rel = await api('POST', '/repos/' + O + '/' + R + '/releases', {
    tag_name: 'v1.0.26', name: '留声 1.0.26', body: BODY, draft: false, prerelease: false,
  })
  if (rel.status !== 201) { console.log('失败 ' + rel.status + ' ' + JSON.stringify(rel.body).slice(0, 200)); return }
  console.log('Release ' + rel.body.tag_name + ' ID=' + rel.body.id)

  await up(rel.body.id, 'C:/Users/Administrator/Desktop/留声-1.0.26-安装包.exe', 'Liusheng-1.0.26-Setup.exe')
  await up(rel.body.id, 'C:/Users/Administrator/Desktop/留声-1.0.26.apk', 'Liusheng-1.0.26.apk')
  console.log('完成')
})()
