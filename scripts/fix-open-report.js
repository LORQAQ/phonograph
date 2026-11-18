'use strict'
/* 打开目录：失败时明确回报；另加「复制路径」和「点击文件下载」 */
const fs = require('node:fs')

/* ---------- 后端 ---------- */
let s = fs.readFileSync('app/server.js', 'utf8')

/* open 分支返回错误信息 */
s = s.replace(
  "      try { require('node:child_process').exec('explorer \"" + "'" + " + dir + " + "\"') } catch (e) { }",
  "      let openErr = ''\n      try { require('node:child_process').exec('explorer \"' + dir + '\"') } catch (e) { openErr = e.message }"
)
/* 兼容 spawn 版本 */
s = s.replace(
  `      try {
        require('node:fs').mkdirSync(dir, { recursive: true })
        const { spawn } = require('node:child_process')
        const child = spawn('explorer.exe', [dir], { detached: true, stdio: 'ignore' })
        child.unref()
      } catch (e) { }`,
  `      let openErr = ''
      try {
        fs.mkdirSync(dir, { recursive: true })
        const { spawn } = require('node:child_process')
        const child = spawn('explorer.exe', [dir], { detached: true, stdio: 'ignore' })
        child.on('error', (e2) => { openErr = e2.message })
        child.unref()
      } catch (e) { openErr = e.message }`
)
s = s.replace(
  "      return { ok: true, dir }\n    }\n    const set = q.get('set')",
  "      return { ok: !openErr, dir, error: openErr || undefined }\n    }\n    const set = q.get('set')"
)

/* 新增：下载单个文件给浏览器 */
if (!s.includes("'/api/downloads/get'")) {
  const anchor = "  /* 删除已下载文件 */"
  const route = `  /* 把已下载的文件发给浏览器 */
  async '/api/downloads/get' (req, q, res) {
    const name = q.get('name')
    if (!name) return json(res, 400, { error: '缺少文件名' })
    const dir = db.settings.downloadDir || defaultDownloadDir()
    const full = path.join(dir, name)
    if (!full.startsWith(dir)) return json(res, 400, { error: '非法路径' })
    if (!fs.existsSync(full)) return json(res, 404, { error: '文件不存在' })
    const st = fs.statSync(full)
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': st.size,
      'Content-Disposition': 'attachment; filename="' + encodeURIComponent(name) + '"',
    })
    fs.createReadStream(full).pipe(res)
    return null
  },

`
  if (s.includes(anchor)) {
    s = s.replace(anchor, route + anchor)
    console.log('文件下载接口已加')
  }
}

fs.writeFileSync('app/server.js', s, 'utf8')
console.log('open 错误回报:', s.includes('ok: !openErr'))
