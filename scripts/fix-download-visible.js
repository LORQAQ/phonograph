'use strict'
/* 1) 下载成功时 toast 显示真实路径
   2) 下载管理页列出所有候选目录的文件（避免"存了却看不到"）
*/
const fs = require('node:fs')

/* ---------- 后端：/api/downloads 扫所有候选目录 ---------- */
let s = fs.readFileSync('app/server.js', 'utf8')
const start = s.indexOf("  /* 已下载文件列表 */")
const endMark = "  /* 删除已下载文件 */"
const end = s.indexOf(endMark)
if (start > 0 && end > start) {
  const impl = `  /* 已下载文件列表：扫所有候选目录 */
  async '/api/downloads' (req, q) {
    const dirs = [...new Set([
      db.settings.downloadDir,
      defaultDownloadDir(),
      path.join(ROOT, 'downloads'),
    ].filter(Boolean))]

    const map = new Map()
    for (const d of dirs) {
      try {
        for (const f of fs.readdirSync(d)) {
          if (!/\\.(mp3|flac|m4a|ogg|wav)$/i.test(f)) continue
          let st = null
          try { st = fs.statSync(path.join(d, f)) } catch (e) { continue }
          const key = f
          const prev = map.get(key)
          if (!prev || st.mtimeMs > prev.mtime) {
            map.set(key, { name: f, size: st.size, mtime: st.mtimeMs, dir: d })
          }
        }
      } catch (e) { }
    }
    const files = [...map.values()].sort((a, b) => b.mtime - a.mtime)
    return { dir: dirs[0] || '', dirs, files }
  },

`
  s = s.slice(0, start) + impl + s.slice(end)
  fs.writeFileSync('app/server.js', s, 'utf8')
  console.log('后端：/api/downloads 已改为扫所有候选目录')
} else {
  console.log('后端：未找到 /api/downloads')
}

/* ---------- 前端：toast 显示真实路径 ---------- */
const fp = 'public/app.js'
let a = fs.readFileSync(fp, 'utf8')

const oldToast = `      toast('已保存：' + r0.name + '（' + (r0.size / 1048576).toFixed(1) + ' MB）', 3600)`
const newToast = `      const realDir = String(r0.path || '').replace(/[\\\\/][^\\\\/]+$/, '')
      toast('已保存 ' + (r0.size / 1048576).toFixed(1) + ' MB → ' + realDir + '\\\\' + r0.name, 5200)`

if (a.includes(oldToast)) {
  a = a.replace(oldToast, newToast)
  console.log('前端：toast 显示真实路径')
} else {
  console.log('前端：toast 未匹配')
}

/* 下载管理页显示所有目录 */
a = a.replace(
  "  const files = (data && data.files) || []\n  const dir = (data && data.dir) || ''",
  "  const files = (data && data.files) || []\n  const dir = (data && data.dir) || ''\n  const allDirs = (data && data.dirs) || [dir]"
)
a = a.replace(
  `      <span class="dl-dir" title="${dir}">${dir || '未设置目录'}</span>`,
  `      <span class="dl-dir" title="${allDirs.join('\\n')}">${allDirs.length > 1 ? allDirs.length + ' 个目录：' + allDirs.join(' | ') : (dir || '未设置目录')}</span>`
)
/* 每行显示文件所在目录 */
a = a.replace(
  `<td class="c-name">${f.name}</td>`,
  `<td class="c-name">${f.name}<div class="c-dir">${f.dir || ''}</div></td>`
)

fs.writeFileSync(fp, a, 'utf8')
console.log('前端：下载页显示多目录')

/* 样式 */
let css = fs.readFileSync('public/style.css', 'utf8')
if (!css.includes('.c-dir')) {
  css += '\n.dl-list .c-dir{font-size:11px;color:var(--text-3);margin-top:2px;opacity:.75}\n'
  fs.writeFileSync('public/style.css', css, 'utf8')
  console.log('样式已加')
}
