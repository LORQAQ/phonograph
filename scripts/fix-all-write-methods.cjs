'use strict'
/* 把前端所有写操作改成 POST，服务端补进 WRITE_PATHS */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

const done = []
const miss = []

/* ================= 1. 前端：5 处改 POST ================= */
const p = 'public/app.js'
let s = fs.readFileSync(p, 'utf8')

const FIXES = [
  {
    name: '保存下载目录',
    from: `const r = await api('/api/download-dir?set=' + encodeURIComponent(v))`,
    to: `const r = await api('/api/download-dir?set=' + encodeURIComponent(v), { method: 'POST' })`,
  },
  {
    name: '选择目录后回填',
    from: `api('/api/download-dir?set=' + encodeURIComponent(dir)).then((r) => {`,
    to: `api('/api/download-dir?set=' + encodeURIComponent(dir), { method: 'POST' }).then((r) => {`,
  },
  {
    name: '删除已下载文件',
    from: `await api('/api/downloads/remove?name=' + encodeURIComponent(name))`,
    to: `await api('/api/downloads/remove?name=' + encodeURIComponent(name), { method: 'POST' })`,
  },
  {
    name: '打开下载文件夹',
    from: `const r = await api('/api/downloads/reveal?name=' + encodeURIComponent(name) + '&dir=' + encodeURIComponent(dir))`,
    to: `const r = await api('/api/downloads/reveal?name=' + encodeURIComponent(name) + '&dir=' + encodeURIComponent(dir), { method: 'POST' })`,
  },
  {
    name: '音源测速',
    from: `const data = await api('/api/sources/test?' + songParams(song).toString())`,
    to: `const data = await api('/api/sources/test?' + songParams(song).toString(), { method: 'POST' })`,
  },
]

for (const f of FIXES) {
  const cnt = s.split(f.from).length - 1
  if (cnt === 1) {
    s = s.replace(f.from, () => f.to)
    done.push(f.name + ' → POST')
  } else if (cnt === 0) {
    miss.push(f.name + '（锚点未找到）')
  } else {
    miss.push(f.name + '（匹配 ' + cnt + ' 处，不确定）')
  }
}

fs.writeFileSync(p, s, 'utf8')

/* ================= 2. 服务端：补 WRITE_PATHS ================= */
const sp = 'app/server.js'
let sv = fs.readFileSync(sp, 'utf8')

const need = ['/api/downloads/reveal', '/api/sources/test']
for (const w of need) {
  if (sv.includes("'" + w + "'")) {
    done.push(w + ' 已在写名单')
    continue
  }
  const anchor = `        '/api/downloads/remove',`
  if (sv.includes(anchor)) {
    sv = sv.replace(anchor, () => anchor + `\n        '${w}',`)
    done.push(w + ' → 加进写名单')
  } else {
    miss.push(w + '（WRITE_PATHS 锚点未找到）')
    break
  }
}
fs.writeFileSync(sp, sv, 'utf8')

console.log('=== 完成 ===')
done.forEach((d) => console.log('  ✓ ' + d))
if (miss.length) {
  console.log('\n=== 未处理 ===')
  miss.forEach((m) => console.log('  ⚠ ' + m))
}

/* ================= 3. 复查 ================= */
console.log('\n=== WRITE_PATHS 现状 ===')
const cur = fs.readFileSync(sp, 'utf8')
const i = cur.indexOf('WRITE_PATHS = new Set')
console.log(cur.slice(i, cur.indexOf('])', i) + 2))
