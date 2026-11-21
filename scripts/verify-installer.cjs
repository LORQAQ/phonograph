'use strict'
/**
 * 校验安装包内容
 * 修 P1：
 *   - 版本号原来写死 1.0.28，换版本就失效
 *   - 26 项里没有一项检查 留声.exe —— 外壳缺失也能全绿
 *   - 没有版本断言、没有字节比对
 */
const path = require('node:path')
const fs = require('node:fs')
const { execSync } = require('node:child_process')
process.chdir(path.resolve(__dirname, '..'))

const VERSION = (fs.readFileSync('public/app.js', 'utf8').match(/const APP_VERSION = '([^']+)'/) || [])[1]
if (!VERSION) { console.log('✗ 读不到 APP_VERSION'); process.exit(1) }

const EXE = '留声-' + VERSION + '-安装包.exe'
let pass = 0
let fail = 0
const failures = []
function ok (n, e) { pass++; console.log('  ✓ ' + n + (e ? '  ' + e : '')) }
function bad (n, d) { fail++; failures.push(n + (d ? ' — ' + d : '')); console.log('  ✗ ' + n + (d ? '  ' + d : '')) }

console.log('================ 安装包内容校验 ================')
console.log('期望版本: ' + VERSION)
console.log('目标文件: ' + EXE + '\n')

if (!fs.existsSync(EXE)) {
  console.log('✗ 安装包不存在')
  process.exit(1)
}

const TMP = path.join('build', '_chk_installer')
fs.rmSync(TMP, { recursive: true, force: true })
fs.mkdirSync(TMP, { recursive: true })

try {
  const buf = fs.readFileSync(EXE)
  ok('安装包存在', (buf.length / 1048576).toFixed(2) + ' MB')

  /* 找内嵌 zip */
  const idx = buf.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
  if (idx < 0) throw new Error('找不到内嵌 payload.zip')
  ok('找到内嵌 payload.zip', 'offset=' + idx)

  const zipPath = path.join(TMP, 'p.zip')
  fs.writeFileSync(zipPath, buf.slice(idx))

  /* UTF-8 标志 */
  let badUtf8 = 0
  const payload = buf.slice(idx)
  for (let i = 0; i < payload.length - 4; i++) {
    if (payload[i] === 0x50 && payload[i + 1] === 0x4b && payload[i + 2] === 0x01 && payload[i + 3] === 0x02) {
      const flags = payload.readUInt16LE(i + 8)
      const nameLen = payload.readUInt16LE(i + 28)
      const nb = payload.slice(i + 46, i + 46 + nameLen)
      if (nb.some((x) => x > 127) && !(flags & 0x0800)) badUtf8++
    }
  }
  badUtf8 === 0 ? ok('中文条目都置了 UTF-8 标志') : bad('中文条目 UTF-8 标志', badUtf8 + ' 个未置')

  /* 解包 */
  execSync('tar.exe -xf "' + zipPath + '" -C "' + TMP + '"', { stdio: 'pipe' })

  /* ---- 关键文件（原来完全没查 留声.exe）---- */
  const MUST = [
    ['留声.exe', 60000],
    ['LXMusic.ico', 1000],
    ['README.md', 100],
    ['runtime/node.exe', 50000000],
    ['app/server.js', 10000],
    ['app/lib/kugou-gcid.js', 5000],
    ['public/app.js', 50000],
    ['public/index.html', 10000],
    ['public/style.css', 10000],
    ['WebView2Loader.dll', 100000],
  ]
  console.log('\n  关键文件:')
  for (const [rel, minSize] of MUST) {
    const p = path.join(TMP, rel.split('/').join(path.sep))
    if (!fs.existsSync(p)) { bad('包内 ' + rel, '缺失'); continue }
    const sz = fs.statSync(p).size
    if (sz < minSize) bad('包内 ' + rel, sz + 'B < 期望 ' + minSize + 'B')
    else ok('包内 ' + rel, sz + 'B')
  }

  /* sources 目录 */
  const srcDir = path.join(TMP, 'sources')
  if (fs.existsSync(srcDir)) {
    const n = fs.readdirSync(srcDir).filter((f) => f.endsWith('.js')).length
    n > 0 ? ok('sources 音源脚本', n + ' 个') : bad('sources 音源脚本', '0 个')
  } else bad('sources 目录', '缺失')

  /* ---- 版本断言 ---- */
  console.log('\n  版本:')
  try {
    const s = fs.readFileSync(path.join(TMP, 'public', 'app.js'), 'utf8')
    const v = (s.match(/const APP_VERSION = '([^']+)'/) || [])[1]
    v === VERSION ? ok('包内 app.js 版本 = ' + v) : bad('包内版本', v + ' ≠ ' + VERSION)
  } catch (e) { bad('读 app.js', e.message) }

  try {
    const s = fs.readFileSync(path.join(TMP, 'app', 'server.js'), 'utf8')
    const v = (s.match(/version: '([^']+)', pid/) || [])[1]
    v === VERSION ? ok('包内 server.js health 版本 = ' + v) : bad('包内 server 版本', v + ' ≠ ' + VERSION)
  } catch (e) { bad('读 server.js', e.message) }

  /* ---- 与源码逐字节比对 ---- */
  console.log('\n  与源码一致:')
  const PAIRS = [
    ['public/app.js', 'public/app.js'],
    ['public/index.html', 'public/index.html'],
    ['public/style.css', 'public/style.css'],
    ['app/server.js', 'app/server.js'],
  ]
  for (const [inPkg, inSrc] of PAIRS) {
    const a = path.join(TMP, inPkg.split('/').join(path.sep))
    const b = path.join(inSrc.split('/').join(path.sep))
    if (!fs.existsSync(a) || !fs.existsSync(b)) { bad(inPkg, '文件缺失'); continue }
    const A = fs.readFileSync(a)
    const B = fs.readFileSync(b)
    A.equals(B) ? ok(inPkg) : bad(inPkg, '包内 ' + A.length + 'B / 源码 ' + B.length + 'B')
  }

  /* ---- 不该进包的东西 ---- */
  console.log('\n  排除项:')
  const NOT_SHIP = ['public/style.css.bak', 'sources/raw']
  for (const rel of NOT_SHIP) {
    const p = path.join(TMP, rel.split('/').join(path.sep))
    !fs.existsSync(p) ? ok('不含 ' + rel) : bad('不该含 ' + rel, '仍在包里')
  }
} catch (e) {
  bad('校验过程', e.message)
} finally {
  fs.rmSync(TMP, { recursive: true, force: true })
}

console.log('\n================ 结果 ================')
console.log('通过 ' + pass + ' / 失败 ' + fail)
if (fail) {
  console.log('\n失败项:')
  failures.forEach((f) => console.log('  - ' + f))
  process.exitCode = 1
} else {
  console.log('全部通过')
}