'use strict'
/* 目录设置放宽：即使当前进程写不了也允许保存（重启后通常正常），只给提示 */
const fs = require('node:fs')
const p = 'app/server.js'
let s = fs.readFileSync(p, 'utf8')

const start = s.indexOf("  async '/api/download-dir' (req, q) {")
if (start < 0) { console.log('未找到接口'); process.exit(1) }
const end = s.indexOf('\n  },', start) + 4
if (end < 4) { console.log('未找到结束'); process.exit(1) }

const impl = `  async '/api/download-dir' (req, q) {
    if (q.get('open')) {
      const dir = db.settings.downloadDir || defaultDownloadDir()
      try { require('node:child_process').exec('explorer "' + dir + '"') } catch (e) { }
      return { ok: true, dir }
    }
    const set = q.get('set')
    if (set && set.trim()) {
      const dir = set.trim()
      try { fs.mkdirSync(dir, { recursive: true }) } catch (e) { }
      db.settings.downloadDir = dir
      saveDb()
      /* 顺便报告当前进程能否写（不阻止保存） */
      let writable = true
      let errMsg = ''
      try {
        const probe = path.join(dir, '.write_test')
        fs.writeFileSync(probe, 'ok')
        fs.unlinkSync(probe)
      } catch (e) {
        writable = false
        errMsg = e.message
      }
      return { dir, writable, error: errMsg || undefined, default: defaultDownloadDir() }
    }
    const dir = db.settings.downloadDir || defaultDownloadDir()
    let writable = true
    try {
      fs.mkdirSync(dir, { recursive: true })
      const probe = path.join(dir, '.write_test')
      fs.writeFileSync(probe, 'ok')
      fs.unlinkSync(probe)
    } catch (e) { writable = false }
    return { dir, writable, default: defaultDownloadDir() }
  },
`

s = s.slice(0, start) + impl + s.slice(end)
fs.writeFileSync(p, s, 'utf8')
console.log('接口已放宽')

/* 前端提示改为友好说法 */
let a = fs.readFileSync('public/app.js', 'utf8')
a = a.replace(
  "        api('/api/download-dir?set=' + encodeURIComponent(dir)).then(() => {\n          toast('下载目录已设为：' + dir, 3000)\n        }).catch((e) => toast('设置失败：' + e.message, 3000))",
  "        api('/api/download-dir?set=' + encodeURIComponent(dir)).then((r) => {\n          if (r && r.writable === false) toast('已设为：' + dir + '（当前进程写不进去，重启程序后一般正常）', 4200)\n          else toast('下载目录已设为：' + dir, 3000)\n        }).catch((e) => toast('设置失败：' + e.message, 3000))"
)
a = a.replace(
  "      const v = ($('#dlDir').value || '').trim()\n      try {\n        const r = await api('/api/download-dir?set=' + encodeURIComponent(v))\n        $('#dlDir').value = r.dir\n        toast('下载目录已设为：' + r.dir, 2600)\n      } catch (e) { toast('设置失败：' + e.message, 2600) }",
  "      const v = ($('#dlDir').value || '').trim()\n      try {\n        const r = await api('/api/download-dir?set=' + encodeURIComponent(v))\n        $('#dlDir').value = r.dir\n        if (r && r.writable === false) toast('已设为：' + r.dir + '（当前进程写不进去，重启程序后一般正常）', 4200)\n        else toast('下载目录已设为：' + r.dir, 2600)\n      } catch (e) { toast('设置失败：' + e.message, 2600) }"
)
fs.writeFileSync('public/app.js', a, 'utf8')
console.log('前端提示已改')
