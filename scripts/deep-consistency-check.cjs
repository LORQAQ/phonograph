'use strict'
/**
 * 产物一致性深度自查 v2（修了 v1 的路径拼接 bug）
 */
const path = require('node:path')
const fs = require('node:fs')
const crypto = require('node:crypto')
const { execSync } = require('node:child_process')
process.chdir(path.resolve(__dirname, '..'))

const md5 = (f) => crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex')
const norm = (f) => f.split(path.sep).join('/')

function walk (dir, base) {
  const out = []
  if (!fs.existsSync(dir)) return out
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    const rel = base === undefined ? e.name : path.join(base, e.name)
    if (e.isDirectory()) out.push(...walk(p, rel))
    else out.push(norm(rel))
  }
  return out
}

/* 有意不打进发布包的文件（不是 bug）：
   - public/style.css.bak       旧样式备份，不该发给用户
   - sources/raw/**             音源原始文件，source-manager 只扫 sources/ 顶层，永不加载
   - app/data/**                运行时数据，用户的歌单 */
const EXCLUDE = [
  /^public\/style\.css\.bak$/,
  /^sources\/raw\//,
  /^app\/data\//,
]
const isExcluded = (f) => EXCLUDE.some((re) => re.test(f))

/* ================= 1. 安装包 payload ================= */
console.log('================ 1. 安装包 payload ================')
{
  const exe = '留声-1.0.28-安装包.exe'
  if (!fs.existsSync(exe)) console.log('  ✗ 不存在')
  else {
    const tmp = 'build/_deep_exe'
    fs.rmSync(tmp, { recursive: true, force: true })
    fs.mkdirSync(tmp, { recursive: true })
    try {
      const b = fs.readFileSync(exe)
      const sig = Buffer.from([0x50, 0x4b, 0x03, 0x04])
      const idx = b.indexOf(sig)
      fs.writeFileSync(tmp + '/p.zip', b.slice(idx))
      execSync('tar.exe -xf ' + tmp + '/p.zip -C ' + tmp, { stdio: 'pipe' })

      const inPkg = walk(tmp, '')
      console.log('  包内文件数: ' + inPkg.length)

      const MUST = ['app/server.js', 'app/lib/kugou-gcid.js', 'public/app.js',
        'public/index.html', 'public/style.css', 'runtime/node.exe', '留声.exe', 'LXMusic.ico']
      console.log('\n  关键项:')
      let missCnt = 0
      for (const m of MUST) {
        const hit = inPkg.includes(m)
        if (!hit) missCnt++
        console.log('    ' + (hit ? '✓' : '✗') + ' ' + m)
      }
      const hasSources = inPkg.some((f) => f.startsWith('sources/'))
      console.log('    ' + (hasSources ? '✓' : '✗') + ' sources/ 目录')

      /* 逐文件对比 */
      console.log('\n  逐字节对比（源码 vs 包内）:')
      let same = 0, diff = 0
      const onlySrc = []
      for (const d of ['app', 'public', 'sources']) {
        const srcList = walk(d, d).filter((f) => !/node_modules|\.git/.test(f) && !isExcluded(f))
        for (const f of srcList) {
          if (!inPkg.includes(f)) { onlySrc.push(f); continue }
          try {
            const a = path.join(tmp, f)
            if (!fs.existsSync(a)) { onlySrc.push(f + '(包内缺失)'); continue }
            if (md5(a) === md5(f)) same++
            else { diff++; console.log('    ✗ 内容不同: ' + f) }
          } catch (e) { console.log('    ⚠ 读失败 ' + f + ': ' + e.message) }
        }
      }
      console.log('    一致 ' + same + ' / 不同 ' + diff)
      if (onlySrc.length) {
        console.log('    ⚠ 源码有、包内无 (' + onlySrc.length + '):')
        onlySrc.slice(0, 15).forEach((f) => console.log('      - ' + f))
      } else {
        console.log('    ✓ 源码文件全部在包内')
      }

      /* 包内多出来的 */
      const srcAll = new Set(['app', 'public', 'sources'].flatMap((d) => walk(d, d)))
      const extra = inPkg.filter((f) => {
        if (f === 'p.zip') return false
        if (f === '留声.exe' || f === 'LXMusic.ico' || f === 'README.md') return false
        if (f.startsWith('runtime/')) return false
        if (/^Microsoft\.Web\.WebView2/.test(f) || f === 'WebView2Loader.dll') return false
        return !srcAll.has(f)
      })
      if (extra.length) {
        console.log('    ⚠ 包内多出 (' + extra.length + '): ' + extra.slice(0, 10).join(', '))
      } else {
        console.log('    ✓ 无多余文件')
      }
    } catch (e) { console.log('  ✗ ' + e.message) }
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

/* ================= 2. APK ================= */
console.log('\n================ 2. APK assets/www ================')
{
  const apk = '留声.apk'
  if (!fs.existsSync(apk)) console.log('  ✗ 不存在')
  else {
    const tmp = 'build/_deep_apk'
    fs.rmSync(tmp, { recursive: true, force: true })
    fs.mkdirSync(tmp, { recursive: true })
    try {
      execSync('tar.exe -xf ' + apk + ' -C ' + tmp, { stdio: 'pipe' })
      const awww = path.join(tmp, 'assets', 'www')
      if (!fs.existsSync(awww)) console.log('  ✗ 没有 assets/www')
      else {
        const inApk = walk(awww, '')
        const inSrc = walk('mobile/www', '')
        console.log('  APK 内 ' + inApk.length + ' 个 / mobile/www ' + inSrc.length + ' 个')

        let same = 0, diff = 0
        const onlySrc = [], onlyApk = []
        for (const f of inSrc) {
          if (!inApk.includes(f)) { onlySrc.push(f); continue }
          const a = path.join(awww, f.split('/').join(path.sep))
          if (fs.existsSync(a) && md5(a) === md5(path.join('mobile/www', f.split('/').join(path.sep)))) same++
          else { diff++; console.log('    ✗ 不同: ' + f) }
        }
        for (const f of inApk) if (!inSrc.includes(f)) onlyApk.push(f)

        console.log('    一致 ' + same + ' / 不同 ' + diff)
        onlySrc.length ? console.log('    ⚠ 仅源码: ' + onlySrc.join(', ')) : console.log('    ✓ 无遗漏')
        onlyApk.length ? console.log('    ⚠ 仅 APK: ' + onlyApk.join(', ')) : console.log('    ✓ 无多余')

        const CRIT = ['app.js', 'api-mobile.js', 'index.html', 'style.css', 'sources-data.js',
          'lib/lx-engine-web.js', 'lib/native-http.js', 'lib/music-libs.js']
        console.log('\n  关键文件:')
        for (const c of CRIT) {
          const p1 = path.join(awww, c.split('/').join(path.sep))
          const p2 = path.join('mobile/www', c.split('/').join(path.sep))
          if (!fs.existsSync(p1)) { console.log('    ✗ APK 缺 ' + c); continue }
          const eq = fs.existsSync(p2) && md5(p1) === md5(p2)
          console.log('    ' + (eq ? '✓' : '✗') + ' ' + c.padEnd(24) + fs.statSync(p1).size + 'B')
        }
      }
    } catch (e) { console.log('  ✗ ' + e.message) }
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

/* ================= 3. 版本号 ================= */
console.log('\n================ 3. 版本号散布 ================')
{
  const TARGETS = [
    ['public/app.js', /const APP_VERSION = '([^']+)'/],
    ['mobile/www/app.js', /const APP_VERSION = '([^']+)'/],
    ['app/server.js', /version: '([^']+)', pid/],
    ['../apk-build/app/AndroidManifest.xml', /android:versionName="([^"]+)"/],
    ['../apk-build/app/AndroidManifest.xml', /android:versionCode="(\d+)"/],
  ]
  for (const [f, re] of TARGETS) {
    if (!fs.existsSync(f)) { console.log('  - ' + f + ' 不存在'); continue }
    const m = fs.readFileSync(f, 'utf8').match(re)
    console.log('  ' + (m ? m[1] : '✗ 未找到').padEnd(12) + f)
  }
}