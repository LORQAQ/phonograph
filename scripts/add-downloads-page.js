'use strict'
/* 下载管理：后端列目录 + 前端独立板块（不依赖 explorer） */
const fs = require('node:fs')

/* ---------- 1) 后端 /api/downloads ---------- */
let s = fs.readFileSync('app/server.js', 'utf8')
if (!s.includes("'/api/downloads'")) {
  const anchor = "  async '/api/download' (req, q, res) {"
  const route = `  /* 已下载文件列表 */
  async '/api/downloads' (req, q) {
    const dir = db.settings.downloadDir || defaultDownloadDir()
    try { fs.mkdirSync(dir, { recursive: true }) } catch (e) { }
    let files = []
    try {
      files = fs.readdirSync(dir)
        .filter((f) => /\\.(mp3|flac|m4a|ogg|wav)$/i.test(f))
        .map((f) => {
          let st = null
          try { st = fs.statSync(path.join(dir, f)) } catch (e) { }
          return { name: f, size: st ? st.size : 0, mtime: st ? st.mtimeMs : 0 }
        })
        .sort((a, b) => b.mtime - a.mtime)
    } catch (e) { }
    return { dir, files }
  },

  /* 删除已下载文件 */
  async '/api/downloads/remove' (req, q) {
    const name = q.get('name')
    if (!name) throw Object.assign(new Error('缺少文件名'), { code: 400 })
    const dir = db.settings.downloadDir || defaultDownloadDir()
    const full = path.join(dir, name)
    if (!full.startsWith(dir)) throw Object.assign(new Error('非法路径'), { code: 400 })
    try { fs.unlinkSync(full) } catch (e) { throw Object.assign(new Error('删除失败：' + e.message), { code: 500 }) }
    return { ok: true }
  },

`
  if (s.includes(anchor)) {
    s = s.replace(anchor, route + anchor)
    fs.writeFileSync('app/server.js', s, 'utf8')
    console.log('后端接口已加')
  } else {
    console.log('未找到插入点')
  }
} else {
  console.log('后端已存在')
}

/* ---------- 2) 左侧栏加「下载」入口 ---------- */
let h = fs.readFileSync('public/index.html', 'utf8')
if (!h.includes('data-view="downloads"')) {
  h = h.replace(
    '<button class="rail-item" data-view="recent"><svg><use href="#i-clock"/></svg><span>最近播放</span></button>',
    '<button class="rail-item" data-view="recent"><svg><use href="#i-clock"/></svg><span>最近播放</span></button>\n      <button class="rail-item" data-view="downloads"><svg><use href="#i-download"/></svg><span>下载管理</span></button>'
  )
  fs.writeFileSync('public/index.html', h, 'utf8')
  console.log('侧栏入口已加')
} else {
  console.log('侧栏入口已存在')
}
