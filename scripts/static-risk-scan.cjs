'use strict'
/**
 * 静态风险扫描
 * 1. 硬编码密钥/token
 * 2. 未 catch 的 await / 空 catch
 * 3. innerHTML 未转义
 * 4. 定时器/监听器泄漏
 * 5. 危险 API（eval / exec / 路径拼接）
 * 6. TODO / FIXME / 死代码
 */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

const FILES = [
  'app/server.js', 'app/lib/kugou-gcid.js', 'app/lib/cross-platform.js',
  'app/lib/source-manager.js', 'app/lib/lx-engine.js', 'app/lib/playlist-import.js',
  'app/lib/transcode.js', 'app/lib/qq.js', 'app/lib/kugou.js',
  'public/app.js', 'public/index.html',
  'mobile/www/api-mobile.js', 'mobile/www/lib/lx-engine-web.js',
  'mobile/www/lib/native-http.js', 'mobile/www/lib/music-libs.js',
  'scripts/NativeShell.cs', 'scripts/Installer.cs',
  '../apk-build/app/src/com/phonograph/player/LocalProxy.java',
  '../apk-build/app/src/com/phonograph/player/NapiBridge.java',
  '../apk-build/app/src/com/phonograph/player/MainActivity.java',
  '../apk-build/app/src/com/phonograph/player/LyricWindow.java',
]

function scanLines (file) {
  if (!fs.existsSync(file)) return []
  return fs.readFileSync(file, 'utf8').split('\n')
}

const report = { secrets: [], emptyCatch: [], dangerous: [], todo: [], timers: [] }

for (const f of FILES) {
  const lines = scanLines(f)
  lines.forEach((l, i) => {
    const n = i + 1
    const t = l.trim()

    /* 1. 密钥 */
    if (/ghp_[A-Za-z0-9]{20,}/.test(l)) report.secrets.push({ f, n, t: 'GitHub token' })
    if (/(api[_-]?key|secret|passwd|password)\s*[:=]\s*['"][^'"]{8,}['"]/i.test(l) && !/placeholder|example|your_|xxx/i.test(l)) {
      report.secrets.push({ f, n, t: t.slice(0, 90) })
    }

    /* 2. 空 catch */
    if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(l)) report.emptyCatch.push({ f, n, t: t.slice(0, 100) })

    /* 3. 危险 API */
    if (/\beval\s*\(/.test(l)) report.dangerous.push({ f, n, kind: 'eval', t: t.slice(0, 90) })
    if (/new Function\s*\(/.test(l)) report.dangerous.push({ f, n, kind: 'new Function', t: t.slice(0, 90) })
    if (/execSync|execFileSync|child_process\.exec\(/.test(l)) report.dangerous.push({ f, n, kind: 'child_process', t: t.slice(0, 90) })
    if (/\.innerHTML\s*=/.test(l) && !/esc\(|textContent|'<|`</.test(l)) {
      report.dangerous.push({ f, n, kind: 'innerHTML 无 esc', t: t.slice(0, 90) })
    }

    /* 4. 定时器 */
    if (/setInterval\s*\(/.test(l)) report.timers.push({ f, n, kind: 'setInterval', t: t.slice(0, 90) })

    /* 5. TODO */
    if (/\b(TODO|FIXME|XXX|HACK)\b/.test(l)) report.todo.push({ f, n, t: t.slice(0, 100) })
  })
}

function section (title, arr, fmt) {
  console.log('\n' + title + '  (' + arr.length + ')')
  if (!arr.length) { console.log('  ✓ 无'); return }
  arr.slice(0, 20).forEach((x) => console.log('  ' + fmt(x)))
  if (arr.length > 20) console.log('  ... 还有 ' + (arr.length - 20) + ' 条')
}

console.log('================ 静态风险扫描 ================')
section('【1】硬编码密钥', report.secrets, (x) => x.f + ':' + x.n + '  ' + x.t)
section('【2】空 catch（吞异常）', report.emptyCatch, (x) => x.f + ':' + x.n + '  ' + x.t)
section('【3】setInterval（需确认有清理）', report.timers, (x) => x.f + ':' + x.n + '  ' + x.t)
section('【4】TODO/FIXME', report.todo, (x) => x.f + ':' + x.n + '  ' + x.t)

console.log('\n【5】危险 API 分类统计')
const byKind = {}
for (const d of report.dangerous) byKind[d.kind] = (byKind[d.kind] || 0) + 1
Object.keys(byKind).forEach((k) => console.log('  ' + k.padEnd(16) + byKind[k]))

console.log('\n【5a】innerHTML 无 esc 的明细（前 25 条）')
report.dangerous.filter((d) => d.kind === 'innerHTML 无 esc').slice(0, 25)
  .forEach((d) => console.log('  ' + d.f + ':' + d.n + '  ' + d.t))

console.log('\n【5b】eval / new Function 明细')
report.dangerous.filter((d) => d.kind === 'eval' || d.kind === 'new Function')
  .forEach((d) => console.log('  ' + d.f + ':' + d.n + '  [' + d.kind + ']  ' + d.t))

console.log('\n【5c】child_process 明细')
report.dangerous.filter((d) => d.kind === 'child_process')
  .forEach((d) => console.log('  ' + d.f + ':' + d.n + '  ' + d.t))