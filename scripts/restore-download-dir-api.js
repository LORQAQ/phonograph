'use strict'
/* 补回 /api/download-dir 接口（恢复备份时丢了） */
const fs = require('node:fs')
const p = 'app/server.js'
let s = fs.readFileSync(p, 'utf8')

if (s.includes("'/api/download-dir'")) {
  console.log('接口已存在')
  process.exit(0)
}

/* 1) 默认目录函数 */
if (!s.includes('function defaultDownloadDir')) {
  s = s.replace(
    'function proxyStream (',
    `/** 默认下载目录：用户下载文件夹下的 Liusheng */
function defaultDownloadDir () {
  const home = process.env.USERPROFILE || process.env.HOME || '.'
  return path.join(home, 'Downloads', 'Liusheng')
}

function proxyStream (`
  )
}

/* 2) 路由：放在 /api/download 之前 */
const anchor = "  async '/api/download' (req, q, res) {"
const route = `  /* 下载目录：查询 / 设置 / 打开 */
  async '/api/download-dir' (req, q) {
    if (q.get('open')) {
      const dir = db.settings.downloadDir || defaultDownloadDir()
      try { require('node:child_process').exec('explorer "' + dir + '"') } catch (e) { }
      return { ok: true, dir }
    }
    const set = q.get('set')
    if (set && set.trim()) {
      const dir = set.trim()
      try {
        fs.mkdirSync(dir, { recursive: true })
        /* 试写一个文件确认真的可写 */
        const probe = path.join(dir, '.write_test')
        fs.writeFileSync(probe, 'ok')
        fs.unlinkSync(probe)
      } catch (e) {
        throw Object.assign(new Error('目录不可写：' + e.message), { code: 400 })
      }
      db.settings.downloadDir = dir
      saveDb()
    }
    return { dir: db.settings.downloadDir || defaultDownloadDir(), default: defaultDownloadDir() }
  },

`

if (s.includes(anchor)) {
  s = s.replace(anchor, route + anchor)
  fs.writeFileSync(p, s, 'utf8')
  console.log('接口已补回')
} else {
  console.log('未找到插入点')
}
