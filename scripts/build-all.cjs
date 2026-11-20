'use strict'
/**
 * 统一构建脚本 —— 修 P0-3 与 B3/B4/B7/B10
 *
 * 这个脚本替代之前手工执行的十几条命令，保证：
 *   1. 版本号从单一来源读取（public/app.js 的 APP_VERSION）
 *   2. APK 打包后**自动归档**成 留声-<ver>.apk 与 留声.apk
 *   3. 安装包用 UTF-8 zip（非中文 Windows 也能正确解出 留声.exe）
 *   4. 每一步产物都做版本断言，不符就 exit 1
 *
 * 用法: node build-all.cjs [--apk] [--exe] [--all]
 */
const path = require('node:path')
const fs = require('node:fs')
const { execFileSync, execSync } = require('node:child_process')
process.chdir(path.resolve(__dirname, '..'))

const ROOT = process.cwd()
const NODE = path.join(ROOT, 'runtime', 'node.exe')
const doApk = process.argv.includes('--apk') || process.argv.includes('--all') || process.argv.length === 2
const doExe = process.argv.includes('--exe') || process.argv.includes('--all') || process.argv.length === 2

let failed = 0
function step (name, fn) {
  const t0 = Date.now()
  try {
    const r = fn()
    console.log('  ✓ ' + name + (r ? '  ' + r : '') + '  (' + (Date.now() - t0) + 'ms)')
    return true
  } catch (e) {
    failed++
    console.log('  ✗ ' + name + '  ' + (e && e.message ? e.message : e))
    return false
  }
}

/* ---------- 0. 读版本（单一来源） ---------- */
console.log('================ 构建 ================\n')
console.log('【0】版本')
let VERSION = ''
step('读取版本', () => {
  const app = fs.readFileSync('public/app.js', 'utf8')
  const m = app.match(/const APP_VERSION = '([^']+)'/)
  if (!m) throw new Error('public/app.js 没有 APP_VERSION')
  VERSION = m[1]

  /* 与 Manifest、server.js 交叉校验 */
  const mf = fs.readFileSync('../apk-build/app/AndroidManifest.xml', 'utf8')
  const vName = (mf.match(/android:versionName="([^"]+)"/) || [])[1]
  const sv = fs.readFileSync('app/server.js', 'utf8')
  const vSrv = (sv.match(/version: '([^']+)', pid/) || [])[1]

  if (vName !== VERSION) throw new Error('版本不一致: app.js=' + VERSION + ' Manifest=' + vName)
  if (vSrv !== VERSION) throw new Error('版本不一致: app.js=' + VERSION + ' server.js=' + vSrv)
  return VERSION + '（app.js / Manifest / server.js 三处一致）'
})

/* ---------- 1. 组装 mobile ---------- */
console.log('\n【1】组装手机端')
step('assemble-mobile-www', () => {
  const out = execFileSync(NODE, ['scripts/assemble-mobile-www.js'], { encoding: 'utf8' })
  const m = out.match(/(\d+)\s*个文件/)
  return m ? m[1] + ' 个文件' : 'ok'
})

/* ---------- 2. 语法检查 ---------- */
console.log('\n【2】语法')
for (const f of ['public/app.js', 'app/server.js', 'mobile/www/app.js', 'mobile/www/api-mobile.js']) {
  step(f, () => {
    execFileSync(NODE, ['--check', f], { stdio: 'pipe' })
    return ''
  })
}

/* ---------- 3. 打包 APK ---------- */
if (doApk) {
  console.log('\n【3】APK')
  step('build-apk.ps1', () => {
    const ps = path.join(ROOT, '..', 'apk-build', 'build-apk.ps1')
    const out = execSync('powershell -NoProfile -ExecutionPolicy Bypass -File "' + ps + '"', {
      encoding: 'utf8', cwd: path.join(ROOT, '..', 'apk-build'),
      env: Object.assign({}, process.env, { PHONOGRAPH_KS_PASS: process.env.PHONOGRAPH_KS_PASS || 'phonograph' }),
      stdio: 'pipe',
    })
    const m = out.match(/APK OK: (.+?) {2}([\d.]+ KB)/)
    return m ? m[1].trim() + ' ' + m[2] : 'ok'
  })

  /* 归档 —— 这是上次翻车的地方（留声.apk 还是 1.0.0） */
  step('归档 APK', () => {
    const src = path.join(ROOT, '..', 'apk-build', 'liusheng.apk')
    if (!fs.existsSync(src)) throw new Error('APK 没生成')
    const dstVersioned = path.join(ROOT, '留声-' + VERSION + '.apk')
    const dstLatest = path.join(ROOT, '留声.apk')
    fs.copyFileSync(src, dstVersioned)
    fs.copyFileSync(src, dstLatest)
    return '留声-' + VERSION + '.apk + 留声.apk'
  })

  /* 版本断言 */
  step('校验 APK 内版本', () => {
    const tmp = path.join(ROOT, 'build', '_bapk')
    fs.rmSync(tmp, { recursive: true, force: true })
    fs.mkdirSync(tmp, { recursive: true })
    try {
      execSync('tar.exe -xf "' + path.join(ROOT, '留声.apk') + '" -C "' + tmp + '"', { stdio: 'pipe' })
      const appJs = path.join(tmp, 'assets', 'www', 'app.js')
      if (!fs.existsSync(appJs)) throw new Error('APK 内没有 assets/www/app.js')
      const s = fs.readFileSync(appJs, 'utf8')
      const v = (s.match(/const APP_VERSION = '([^']+)'/) || [])[1]
      if (v !== VERSION) throw new Error('APK 内版本 ' + v + ' ≠ 期望 ' + VERSION)
      /* 与源码逐字节比对 */
      const src = fs.readFileSync(path.join(ROOT, 'mobile', 'www', 'app.js'), 'utf8')
      if (s !== src) throw new Error('APK 内 app.js 与 mobile/www/app.js 不一致')
      return 'v' + v + '，与源码一致'
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })
}

/* ---------- 4. 打包桌面 ---------- */
if (doExe) {
  console.log('\n【4】桌面安装包')
  step('准备 payload', () => {
    const payload = path.join(ROOT, 'build', 'payload')
    /* 先清空 —— 避免上一版残留被打进新包 */
    fs.rmSync(payload, { recursive: true, force: true })
    fs.mkdirSync(payload, { recursive: true })

    const dirs = ['app', 'public', 'sources', 'runtime']
    for (const d of dirs) {
      if (!fs.existsSync(d)) continue
      copyDir(path.join(ROOT, d), path.join(payload, d))
    }
    /* 排除不该发布的：备份文件、音源原始目录 */
    removeIfExists(path.join(payload, 'public', 'style.css.bak'))
    removeIfExists(path.join(payload, 'sources', 'raw'))
    removeIfExists(path.join(payload, 'app', 'data'))

    const files = ['留声.exe', 'LXMusic.ico', 'Microsoft.Web.WebView2.Core.dll',
      'Microsoft.Web.WebView2.WinForms.dll', 'WebView2Loader.dll', 'README.md']
    for (const f of files) {
      if (fs.existsSync(f)) fs.copyFileSync(f, path.join(payload, f))
    }
    /* 关键文件必须都在 */
    for (const must of ['留声.exe', 'runtime/node.exe', 'app/server.js', 'public/app.js']) {
      if (!fs.existsSync(path.join(payload, must))) throw new Error('payload 缺 ' + must)
    }
    return countFiles(payload) + ' 个文件'
  })

  step('生成 UTF-8 zip', () => {
    const zip = path.join(ROOT, 'build', 'payload_utf8.zip')
    fs.rmSync(zip, { force: true })
    const out = execFileSync(NODE, ['scripts/make-payload-zip.cjs', 'build/payload', 'build/payload_utf8.zip'], { encoding: 'utf8' })
    if (/未置 [1-9]/.test(out)) throw new Error('仍有条目未置 UTF-8 标志')
    const m = out.match(/([\d.]+) MB/)
    return m ? m[1] + ' MB' : 'ok'
  })

  step('编译安装包', () => {
    const csc = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe'
    const outName = '留声-' + VERSION + '-安装包.exe'
    const out = path.join(ROOT, outName)
    const tmpOut = path.join(ROOT, 'build', '_setup_tmp.exe')
    fs.rmSync(out, { force: true })
    fs.rmSync(tmpOut, { force: true })

    /* 先编译到纯 ASCII 名字，再用 Node 改名。
       直接把中文名传给 execSync 会经 cmd.exe 转码，实测报
       "error CS0016: 无法写入输出文件 -- 拒绝访问"（路径被搞坏）。 */
    const cmd = [
      '"' + csc + '"',
      '/nologo', '/target:winexe',
      '/out:"' + tmpOut + '"',
      '/win32icon:LXMusic.ico',
      '/r:System.dll', '/r:System.Windows.Forms.dll', '/r:System.Drawing.dll',
      '/r:System.IO.Compression.dll', '/r:System.IO.Compression.FileSystem.dll',
      '/resource:"build\\payload_utf8.zip",payload.zip',
      'scripts\\Installer.cs',
    ].join(' ')
    let errOut = ''
    try {
      execSync(cmd, { stdio: 'pipe', cwd: ROOT, encoding: 'utf8' })
    } catch (e) {
      errOut = String(e.stdout || '') + String(e.stderr || '')
    }
    if (!fs.existsSync(tmpOut)) {
      throw new Error('安装包没生成。csc 输出：' + errOut.split('\n').filter(Boolean).slice(0, 3).join(' | '))
    }
    fs.renameSync(tmpOut, out)
    return outName + '  ' + (fs.statSync(out).size / 1048576).toFixed(2) + ' MB'
  })

  step('校验安装包内容', () => {
    const exe = path.join(ROOT, '留声-' + VERSION + '-安装包.exe')
    const b = fs.readFileSync(exe)
    const sig = Buffer.from([0x50, 0x4b, 0x03, 0x04])
    const idx = b.indexOf(sig)
    if (idx < 0) throw new Error('安装包里找不到 payload.zip')
    const tmp = path.join(ROOT, 'build', '_bexe')
    fs.rmSync(tmp, { recursive: true, force: true })
    fs.mkdirSync(tmp, { recursive: true })
    try {
      fs.writeFileSync(path.join(tmp, 'p.zip'), b.slice(idx))
      execSync('tar.exe -xf "' + path.join(tmp, 'p.zip') + '" -C "' + tmp + '"', { stdio: 'pipe' })
      for (const must of ['留声.exe', 'app/server.js', 'public/app.js', 'runtime/node.exe']) {
        if (!fs.existsSync(path.join(tmp, must))) throw new Error('包内缺 ' + must)
      }
      const s = fs.readFileSync(path.join(tmp, 'public', 'app.js'), 'utf8')
      const v = (s.match(/const APP_VERSION = '([^']+)'/) || [])[1]
      if (v !== VERSION) throw new Error('包内版本 ' + v + ' ≠ ' + VERSION)
      return 'v' + v + '，关键文件齐全'
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })
}

/* ---------- 汇总 ---------- */
console.log('\n================ 结果 ================')
if (failed) {
  console.log('✗ ' + failed + ' 个步骤失败')
  process.exitCode = 1
} else {
  console.log('✓ 全部成功')
  console.log('\n产物:')
  for (const f of fs.readdirSync(ROOT)) {
    if (/^留声.*\.(exe|apk)$/.test(f)) {
      console.log('  ' + f.padEnd(32) + (fs.statSync(path.join(ROOT, f)).size / 1048576).toFixed(2) + ' MB')
    }
  }
}

/* ---------- 工具 ---------- */
function copyDir (src, dst) {
  fs.mkdirSync(dst, { recursive: true })
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name)
    const d = path.join(dst, e.name)
    if (e.isDirectory()) copyDir(s, d)
    else fs.copyFileSync(s, d)
  }
}
function removeIfExists (p) {
  try { fs.rmSync(p, { recursive: true, force: true }) } catch (e) { }
}
function countFiles (dir) {
  let n = 0
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) n += countFiles(path.join(dir, e.name))
    else n++
  }
  return n
}