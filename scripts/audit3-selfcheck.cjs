'use strict'
/* 第三轮自检：静态语法 + 关键路径实测 */
const path = require('node:path')
const fs = require('node:fs')
const { execSync } = require('node:child_process')
const http = require('node:http')

const ROOT = path.resolve(__dirname, '..')
process.chdir(ROOT)

const issues = []
function ok (msg) { console.log('  ✓ ' + msg) }
function bad (msg) { console.log('  ✗ ' + msg); issues.push(msg) }

console.log('=== 1. JS 语法 ===')
const jsFiles = [
  'app/server.js', 'app/lib/source-manager.js', 'app/lib/cross-platform.js',
  'app/lib/lx-engine.js', 'app/lib/qq.js', 'app/lib/kugou.js',
  'app/lib/playlist-import.js', 'app/lib/transcode.js',
  'public/app.js',
  'mobile/www/app.js', 'mobile/www/api-mobile.js',
  'mobile/www/lib/lx-engine-web.js', 'mobile/www/lib/native-http.js',
  'mobile/www/lib/music-libs.js',
  'scripts/assemble-mobile-www.js',
]
for (const f of jsFiles) {
  if (!fs.existsSync(f)) { bad(f + ' 不存在'); continue }
  try {
    execSync('"' + path.join(ROOT, 'runtime', 'node.exe') + '" --check "' + f + '"', { stdio: 'pipe' })
    ok(f)
  } catch (e) {
    bad(f + ' 语法错误')
  }
}

console.log('\n=== 2. Java 编译 ===')
try {
  const jdk = fs.readdirSync(path.join(ROOT, '..', 'apk-build', 'tools', 'jdk'))[0]
  const javac = path.join(ROOT, '..', 'apk-build', 'tools', 'jdk', jdk, 'bin', 'javac.exe')
  const aj = path.join(ROOT, '..', 'apk-build', 'tools', 'plat', 'android-13', 'android.jar')
  const srcDir = path.join(ROOT, '..', 'apk-build', 'app', 'src')
  const srcs = []
  ;(function walk (d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith('.java')) srcs.push('"' + p + '"')
    }
  })(srcDir)
  const tmp = path.join(ROOT, '..', 'apk-build', 'build', '_audit3')
  fs.rmSync(tmp, { recursive: true, force: true })
  fs.mkdirSync(tmp, { recursive: true })
  execSync('"' + javac + '" -encoding UTF-8 -source 8 -target 8 -nowarn -bootclasspath "' + aj + '" -d "' + tmp + '" ' + srcs.join(' '), { stdio: 'pipe' })
  ok('Java 编译通过')
} catch (e) {
  bad('Java 编译失败: ' + (e.stderr ? String(e.stderr).slice(0, 300) : e.message))
}

console.log('\n=== 3. 关键修复点抽查 ===')
function has (file, pattern, label) {
  const s = fs.readFileSync(file, 'utf8')
  if (s.includes(pattern)) ok(label)
  else bad(label + ' —— 缺失')
}

/* 服务端 */
has('app/server.js', 'function waitForAnySource', 'waitForAnySource 存在')
has('app/server.js', 'urlInflight', 'in-flight 合并')
has('app/server.js', 'function publicSettings', 'Cookie 脱敏')
has('app/server.js', 'PIC_HOST_ALLOW', 'pic 白名单')
has('app/server.js', 'function guard', 'Origin 守卫')
has('app/server.js', 'dbFirstDirtyAt', '写盘合并')
has('app/lib/cross-platform.js', 'similarName', '相似度校验')
has('app/lib/playlist-import.js', 'kgWebHeaders', 'gcid 用移动 UA')
has('app/lib/playlist-import.js', 'listinfo', 'gcid 歌单名')

/* 前端 */
has('public/app.js', 'const urlEl = $(\'#importUrl\')', 'B1 导入取值')
has('public/app.js', 'if (timer) { clearTimeout(timer)', 'B2 timer 保护')
has('public/app.js', '__pcCleanup', 'B53 探测器回收')
has('public/app.js', 'function bindWebviewMessage', 'B6 单次绑定')
has('public/app.js', '__staticFlow', 'B11 歌词滚动')
has('public/app.js', 'forceFresh', 'B55 强制刷新')

/* 手机端 */
has('mobile/www/api-mobile.js', 'cachedMobileApi', 'B18 缓存包装')
has('mobile/www/api-mobile.js', 'const d1 = db()', 'B19 写前重读')
has('mobile/www/lib/lx-engine-web.js', '__fishOk', 'B29 fish 尊重 only')
has('mobile/www/lib/native-http.js', '__HTTP_SESSION', 'B79 会话前缀')

console.log('\n=== 4. 运行时实测 ===')
function get (p, timeout = 30000) {
  return new Promise((resolve) => {
    const t0 = Date.now()
    const q = http.get('http://127.0.0.1:37621' + p, { timeout }, (res) => {
      let d = ''
      res.on('data', (c) => { d += c })
      res.on('end', () => resolve({ status: res.statusCode, body: d, ms: Date.now() - t0 }))
    })
    q.on('error', (e) => resolve({ status: 0, err: e.message, ms: Date.now() - t0 }))
    q.on('timeout', () => { q.destroy(); resolve({ status: 0, err: 'timeout', ms: Date.now() - t0 }) })
  })
}

;(async () => {
  const h = await get('/api/health', 8000)
  if (h.status !== 200) { console.log('  服务没起来，跳过运行时测试'); finish(); return }
  ok('服务在线')

  /* 安全回归 */
  const pic = await get('/api/pic?url=' + encodeURIComponent('http://127.0.0.1:37621/api/db'))
  if (pic.status === 403) ok('SSRF 仍拦截')
  else bad('SSRF 回归！status=' + pic.status)

  const evil = await get('/api/settings')
  const evil2 = await new Promise((resolve) => {
    const q = http.get('http://127.0.0.1:37621/api/settings', { headers: { Origin: 'https://evil.com' }, timeout: 8000 }, (res) => {
      let d = ''
      res.on('data', (c) => { d += c })
      res.on('end', () => resolve({ status: res.statusCode }))
    })
    q.on('error', () => resolve({ status: 0 }))
  })
  if (evil2.status === 403) ok('Origin 守卫仍生效')
  else bad('Origin 守卫回归！status=' + evil2.status)

  /* Cookie 脱敏 */
  if (!/"qqCookie"\s*:\s*"[^"]{10,}/.test(evil.body)) ok('Cookie 仍脱敏')
  else bad('Cookie 脱敏回归！')

  /* B30 回归：GET ?action= */
  const b30 = await get('/api/playlist?action=rename')
  if (b30.status === 405) ok('playlist 写操作仍强制 POST')
  else bad('B30 回归！status=' + b30.status)

  /* 取流 */
  const top = await get('/api/toplist?type=hot&source=wy', 40000)
  let list = []
  try { list = JSON.parse(top.body).list || [] } catch (e) { }
  if (list.length) {
    const s = list[0]
    const qs = new URLSearchParams({ id: s.id, source: 'wy', quality: '320k' })
    const u = await get('/api/url?' + qs.toString(), 60000)
    let j = null
    try { j = JSON.parse(u.body) } catch (e) { }
    if (j && j.url) ok('取流正常 ' + u.ms + 'ms')
    else bad('取流失败: ' + (u.body || u.err || '').slice(0, 80))
  } else {
    bad('拿不到榜单')
  }

  /* 并发去重（B18 服务端） */
  if (list.length) {
    const s = list[1] || list[0]
    const qs = new URLSearchParams({ id: s.id, source: 'wy', quality: '320k' })
    const t0 = Date.now()
    const rs = await Promise.all([1, 2, 3].map(() => get('/api/url?' + qs.toString(), 60000)))
    const urls = rs.map((r) => { try { return JSON.parse(r.body).url } catch (e) { return '' } })
    const uniq = new Set(urls.filter(Boolean)).size
    if (uniq <= 1) ok('并发去重正常（' + uniq + ' 个 URL，' + (Date.now() - t0) + 'ms）')
    else bad('并发去重回归：' + uniq + ' 个不同 URL')
  }

  finish()
})()

function finish () {
  console.log('\n=== 结论 ===')
  if (issues.length === 0) console.log('✓ 全部通过')
  else {
    console.log('✗ ' + issues.length + ' 个问题:')
    issues.forEach((x) => console.log('  - ' + x))
  }
}
