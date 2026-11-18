'use strict'
/* 点击下载列表 → 打开所在文件夹并选中文件（而不是弹另存为） */
const fs = require('node:fs')

/* ---------- 后端：新增 reveal 接口 ---------- */
let s = fs.readFileSync('app/server.js', 'utf8')
if (!s.includes("'/api/downloads/reveal'")) {
  const anchor = "  /* 删除已下载文件 */"
  const route = `  /* 打开文件所在文件夹并选中 */
  async '/api/downloads/reveal' (req, q) {
    const name = q.get('name')
    if (!name) return json(res, 400, { error: '缺少文件名' })
    const dir = (q.get('dir') || db.settings.downloadDir || defaultDownloadDir())
    const full = path.join(dir, name)
    if (!fs.existsSync(full)) return json(res, 404, { error: '文件不存在：' + full })
    let err = ''
    try {
      const { spawn } = require('node:child_process')
      const c = spawn('explorer.exe', ['/select,' + full], { detached: true, stdio: 'ignore' })
      c.on('error', (e) => { err = e.message })
      c.unref()
    } catch (e) { err = e.message }
    return { ok: !err, path: full, dir, error: err || undefined }
  },

`
  if (s.includes(anchor)) {
    s = s.replace(anchor, route + anchor)
    fs.writeFileSync('app/server.js', s, 'utf8')
    console.log('后端 reveal 接口已加')
  } else {
    console.log('后端：未找到插入点')
  }
} else {
  console.log('后端：已存在')
}

/* ---------- 前端：点击行改为 reveal ---------- */
let a = fs.readFileSync('public/app.js', 'utf8')
const oldClick = `  $$('.dl-list tbody tr').forEach((tr) => {
    tr.onclick = (e) => {
      if (e.target.closest('.dl-remove')) return
      const name = decodeURIComponent(tr.dataset.name)
      const a = document.createElement('a')
      a.href = '/api/downloads/get?name=' + encodeURIComponent(name)
      a.download = name
      document.body.appendChild(a)
      a.click()
      setTimeout(() => a.remove(), 1200)
    }
  })`

const newClick = `  $$('.dl-list tbody tr').forEach((tr) => {
    tr.title = '点击在文件夹中定位，双击播放'
    tr.onclick = async (e) => {
      if (e.target.closest('.dl-remove')) return
      const name = decodeURIComponent(tr.dataset.name)
      const dir = tr.dataset.dir || ''
      try {
        const r = await api('/api/downloads/reveal?name=' + encodeURIComponent(name) + '&dir=' + encodeURIComponent(dir))
        if (r && r.ok) { toast('已在文件夹中定位', 1600); return }
        /* 打不开文件夹就复制路径 */
        try { await navigator.clipboard.writeText(r ? r.path : name) } catch (er) { }
        toast('系统不允许打开文件夹，路径已复制：' + ((r && r.path) || name), 4200)
      } catch (err) {
        toast('定位失败：' + err.message, 2600)
      }
    }
  })`

if (a.includes(oldClick)) {
  a = a.replace(oldClick, newClick)
  console.log('前端：点击行改为 reveal')
} else {
  console.log('前端：未匹配点击行')
}

/* 行上带 dir 数据 */
a = a.replace(
  `<tr data-name="${encodeURIComponent(f.name)}">`,
  `<tr data-name="${encodeURIComponent(f.name)}" data-dir="${encodeURIComponent(f.dir || '')}">`
)

fs.writeFileSync('public/app.js', a, 'utf8')
console.log('data-dir:', a.includes('data-dir='))
