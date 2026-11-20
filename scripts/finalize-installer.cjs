'use strict'
/**
 * 收尾：把 build/_setup_compile.exe 改名成 留声-<ver>-安装包.exe 并校验内容
 * 单独拆出来是因为：
 *   - csc 从 Node 里 spawn 会被沙箱拦写权限（必须由 pwsh 直接调用）
 *   - PowerShell 5.1 按 ANSI 读 .ps1，脚本里不能出现中文（改由 Node 处理）
 */
const path = require('node:path')
const fs = require('node:fs')
const { execSync } = require('node:child_process')
process.chdir(path.resolve(__dirname, '..'))

const VERSION = (fs.readFileSync('public/app.js', 'utf8').match(/const APP_VERSION = '([^']+)'/) || [])[1]
if (!VERSION) { console.log('✗ 读不到版本'); process.exit(1) }

const tmp = path.join(process.cwd(), 'build', '_setup_compile.exe')
const outName = '留声-' + VERSION + '-安装包.exe'
const out = path.join(process.cwd(), outName)

if (!fs.existsSync(tmp)) {
  console.log('✗ 找不到 ' + tmp + '（先跑 scripts\\build-installer.ps1）')
  process.exit(1)
}

/* 覆盖旧文件 */
try { fs.rmSync(out, { force: true }) } catch (e) { }
fs.renameSync(tmp, out)
console.log('✓ ' + outName + '  ' + (fs.statSync(out).size / 1048576).toFixed(2) + ' MB')

/* ---------- 校验：解包 + 版本 + 关键文件 + UTF-8 名 ---------- */
const tmpDir = path.join(process.cwd(), 'build', '_verify_exe')
fs.rmSync(tmpDir, { recursive: true, force: true })
fs.mkdirSync(tmpDir, { recursive: true })

let failed = 0
function check (name, cond, detail) {
  if (cond) console.log('  ✓ ' + name + (detail ? '  ' + detail : ''))
  else { failed++; console.log('  ✗ ' + name + (detail ? '  ' + detail : '')) }
}

try {
  const b = fs.readFileSync(out)
  const sig = Buffer.from([0x50, 0x4b, 0x03, 0x04])
  const idx = b.indexOf(sig)
  check('找到 payload.zip', idx > 0, idx > 0 ? 'offset=' + idx : '')

  fs.writeFileSync(path.join(tmpDir, 'p.zip'), b.slice(idx))
  execSync('tar.exe -xf "' + path.join(tmpDir, 'p.zip') + '" -C "' + tmpDir + '"', { stdio: 'pipe' })

  const MUST = ['留声.exe', 'LXMusic.ico', 'app/server.js', 'public/app.js',
    'public/index.html', 'public/style.css', 'runtime/node.exe', 'README.md']
  for (const m of MUST) {
    const p = path.join(tmpDir, m.split('/').join(path.sep))
    check('包内 ' + m, fs.existsSync(p), fs.existsSync(p) ? fs.statSync(p).size + 'B' : '缺失')
  }

  /* 版本 */
  try {
    const s = fs.readFileSync(path.join(tmpDir, 'public', 'app.js'), 'utf8')
    const v = (s.match(/const APP_VERSION = '([^']+)'/) || [])[1]
    check('包内版本 = ' + VERSION, v === VERSION, v)
  } catch (e) { check('包内版本', false, e.message) }

  /* 与源码一致 */
  try {
    const a = fs.readFileSync(path.join(tmpDir, 'public', 'app.js'))
    const bSrc = fs.readFileSync(path.join('public', 'app.js'))
    check('app.js 与源码逐字节一致', a.equals(bSrc))
  } catch (e) { check('app.js 一致', false, e.message) }

  /* UTF-8 标志 */
  let badUtf8 = 0
  for (let i = 0; i < b.length - 4; i++) {
    if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 0x01 && b[i + 3] === 0x02) {
      const flags = b.readUInt16LE(i + 8)
      const nameLen = b.readUInt16LE(i + 28)
      const nameBuf = b.slice(i + 46, i + 46 + nameLen)
      if (nameBuf.some((x) => x > 127) && !(flags & 0x0800)) badUtf8++
    }
  }
  check('中文条目都置了 UTF-8 标志', badUtf8 === 0, badUtf8 ? badUtf8 + ' 个未置' : '')
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true })
}

console.log('')
if (failed) { console.log('✗ ' + failed + ' 项未通过'); process.exitCode = 1 }
else console.log('✓ 安装包校验全部通过')