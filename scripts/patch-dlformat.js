'use strict'
/* 下载格式选择：MP3 320K / FLAC 无损 */
const fs = require('node:fs')

/* ---------- 前端 ---------- */
let app = fs.readFileSync('public/app.js', 'utf8')

if (!app.includes("dlFormat: 'mp3'")) {
  app = app.replace('const state = {', "const state = {\n  dlFormat: 'mp3',")
}

if (!app.includes("p.set('format'")) {
  app = app.replace(
    "if (only) p.set('only', only)",
    "if (only) p.set('only', only)\n  if (typeof state.dlFormat === 'string') p.set('format', state.dlFormat)"
  )
}

/* 保存/读取设置 */
if (!app.includes('dlFormat: state.dlFormat')) {
  app = app.replace(
    'themeMode: state.themeMode,',
    'themeMode: state.themeMode,\n    dlFormat: state.dlFormat,'
  )
}
if (!app.includes('state.dlFormat = s.dlFormat')) {
  app = app.replace(
    "state.themeMode = s.themeMode || 'light'",
    "state.dlFormat = s.dlFormat === 'flac' ? 'flac' : 'mp3'"
  )
}

/* 绑定格式按钮（在 mode-btn 绑定之后追加） */
if (!app.includes("$$('.dl-fmt')")) {
  app = app.replace(
    "  api('/api/lan')",
    `  $$('.dl-fmt').forEach((b) => {
    b.classList.toggle('active', b.dataset.fmt === state.dlFormat)
    b.onclick = () => {
      state.dlFormat = b.dataset.fmt
      $$('.dl-fmt').forEach((x) => x.classList.toggle('active', x === b))
      saveSettings()
      toast('下载格式：' + (state.dlFormat === 'flac' ? 'FLAC 无损' : 'MP3 320K'), 1600)
    }
  })
  api('/api/lan')`
  )
}

/* 下载提示带上格式 */
if (!app.includes('formatLabel')) {
  app = app.replace(
    "toast('开始下载：' + song.name)",
    "toast('开始下载：' + song.name + '（' + (state.dlFormat === 'flac' ? 'FLAC' : 'MP3') + '）')"
  )
}

fs.writeFileSync('public/app.js', app, 'utf8')
console.log('前端:', {
  state: app.includes("dlFormat: 'mp3'"),
  param: app.includes("p.set('format'"),
  save: app.includes('dlFormat: state.dlFormat'),
  load: app.includes('state.dlFormat = s.dlFormat'),
  bind: app.includes("$$('.dl-fmt')"),
})

/* ---------- 服务端 ---------- */
let srv = fs.readFileSync('app/server.js', 'utf8')

/* /api/download 读 format，映射音质 */
if (!srv.includes("q.get('format')")) {
  srv = srv.replace(
    "    const quality = q.get('quality') || db.settings.quality || '320k'\n    const info = await buildMusicInfo(platform, id, extraFromQuery(q))\n\n    /* 与 /api/url 一致：先本平台，失败再跨平台找同款 */",
    `    const wantFormat = q.get('format') === 'flac' ? 'flac' : 'mp3'
    const quality = wantFormat === 'flac' ? 'flac' : (q.get('quality') || db.settings.quality || '320k')
    const info = await buildMusicInfo(platform, id, extraFromQuery(q))

    /* 与 /api/url 一致：先本平台，失败再跨平台找同款 */`
  )
}

fs.writeFileSync('app/server.js', srv, 'utf8')
console.log('服务端 format:', srv.includes("q.get('format')"))

/* ---------- 手机端 ---------- */
let mob = fs.readFileSync('mobile/www/api-mobile.js', 'utf8')
if (!mob.includes("q.get('format')")) {
  mob = mob.replace(
    "      const quality = q.get('quality') || '320k'",
    "      const wantFormat = q.get('format') === 'flac' ? 'flac' : 'mp3'\n      const quality = wantFormat === 'flac' ? 'flac' : (q.get('quality') || '320k')"
  )
}
fs.writeFileSync('mobile/www/api-mobile.js', mob, 'utf8')
console.log('手机端 format:', mob.includes("q.get('format')"))
