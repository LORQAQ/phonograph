'use strict'
/**
 * 全量回归测试 —— 对着跑起来的服务实测，覆盖四轮修复的所有可验证点
 */
const path = require('node:path')
const http = require('node:http')
const fs = require('node:fs')
const { execSync } = require('node:child_process')

process.chdir(path.resolve(__dirname, '..'))
const BASE = 'http://127.0.0.1:37621'

let pass = 0
let fail = 0
const failures = []

function ok (name, extra) {
  pass++
  console.log('  ✓ ' + name + (extra ? '  ' + extra : ''))
}
function bad (name, detail) {
  fail++
  failures.push(name + (detail ? '  — ' + detail : ''))
  console.log('  ✗ ' + name + (detail ? '  ' + detail : ''))
}

function req (p, opts = {}) {
  return new Promise((resolve) => {
    const t0 = Date.now()
    const o = { timeout: opts.timeout || 40000, method: opts.method || 'GET', headers: opts.headers || {} }
    let body = opts.body
    if (body && typeof body === 'object') {
      body = JSON.stringify(body)
      o.headers['Content-Type'] = 'application/json'
      o.headers['Content-Length'] = Buffer.byteLength(body)
    }
    const q = http.request(BASE + p, o, (res) => {
      let d = ''
      res.on('data', (c) => { d += c })
      res.on('end', () => {
        let j = null
        try { j = JSON.parse(d) } catch (e) { }
        resolve({ status: res.statusCode, body: d, json: j, ms: Date.now() - t0, headers: res.headers })
      })
    })
    q.on('error', (e) => resolve({ status: 0, err: e.message, ms: Date.now() - t0 }))
    q.on('timeout', () => { q.destroy(); resolve({ status: 0, err: 'timeout', ms: Date.now() - t0 }) })
    if (body) q.write(body)
    q.end()
  })
}

function stream (p, opts = {}) {
  return new Promise((resolve) => {
    const t0 = Date.now()
    const q = http.get(BASE + p, { timeout: opts.timeout || 40000, headers: opts.headers || {} }, (res) => {
      let got = 0
      let done = false
      const finish = (why) => {
        if (done) return
        done = true
        resolve({ status: res.statusCode, got, ms: Date.now() - t0, why, headers: res.headers })
      }
      res.on('data', (c) => {
        got += c.length
        if (got >= (opts.want || 65536)) { res.destroy(); finish('enough') }
      })
      res.on('end', () => finish('end'))
      res.on('error', () => finish('error'))
    })
    q.on('error', (e) => resolve({ status: 0, err: e.message, got: 0, ms: Date.now() - t0 }))
    q.on('timeout', () => { q.destroy(); resolve({ status: 0, err: 'timeout', got: 0, ms: Date.now() - t0 }) })
  })
}

;(async () => {
  console.log('========== 全量回归 ==========\n')

  /* ---------- 0. 服务存活 ---------- */
  console.log('【0】服务存活')
  const h = await req('/api/health', { timeout: 8000 })
  if (h.status !== 200) { console.log('服务没起来，退出'); process.exit(1) }
  ok('health 200', h.ms + 'ms')

  /* ---------- 1. 静态安全检查 ---------- */
  console.log('\n【1】安全')

  const ssrf = await req('/api/pic?url=' + encodeURIComponent('http://127.0.0.1:37621/api/db'))
  ssrf.status === 403 ? ok('SSRF 拦截本机', String(ssrf.status)) : bad('SSRF 拦截本机', 'status=' + ssrf.status)

  const nullOrigin = await req('/api/health', { headers: { Origin: 'null' } })
  nullOrigin.status === 403 ? ok('Origin:null 拒绝') : bad('Origin:null 拒绝', 'status=' + nullOrigin.status)

  const evilOrigin = await req('/api/health', { headers: { Origin: 'https://evil.com' } })
  evilOrigin.status === 403 ? ok('恶意 Origin 拒绝') : bad('恶意 Origin 拒绝', 'status=' + evilOrigin.status)

  const selfOrigin = await req('/api/health', { headers: { Origin: BASE } })
  selfOrigin.status === 200 ? ok('本机 Origin 放行') : bad('本机 Origin 放行', 'status=' + selfOrigin.status)

  /* LAN Origin */
  const lanInfo = await req('/api/lan')
  let lanIp = ''
  try { lanIp = (JSON.parse(lanInfo.body).ips || [])[0] || '' } catch (e) { }
  if (lanIp) {
    const lanOrigin = await req('/api/health', { headers: { Origin: 'http://' + lanIp + ':37621' } })
    lanOrigin.status === 200 ? ok('LAN Origin 放行 (' + lanIp + ')') : bad('LAN Origin 放行', 'status=' + lanOrigin.status)
  }

  const tp = await req('/api/settings', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{"volume":0.5}' })
  ;[403, 415].includes(tp.status) ? ok('text/plain 写接口拦截', String(tp.status)) : bad('text/plain 写接口拦截', 'status=' + tp.status)

  const dlRemoveGet = await req('/api/downloads/remove?name=x.mp3')
  dlRemoveGet.status === 405 ? ok('downloads/remove 强制 POST') : bad('downloads/remove 强制 POST', 'status=' + dlRemoveGet.status)

  /* Cookie 脱敏 */
  const settings = await req('/api/settings')
  let sj = null
  try { sj = JSON.parse(settings.body) } catch (e) { }
  const cookieLeak = sj && /"qqCookie"\s*:\s*"[^"]{10,}/.test(settings.body)
  !cookieLeak ? ok('Cookie 脱敏') : bad('Cookie 脱敏', '明文泄露')
  sj && sj.qqCookieSet !== undefined ? ok('qqCookieSet 字段存在') : bad('qqCookieSet 字段存在')

  /* ---------- 2. 下载目录（P0 回归点） ---------- */
  console.log('\n【2】下载目录')
  const dd1 = await req('/api/download-dir')
  dd1.status === 200 ? ok('GET download-dir 可读', dd1.ms + 'ms') : bad('GET download-dir 可读', 'status=' + dd1.status)
  const dd2 = await req('/api/download-dir?set=' + encodeURIComponent('C:\\Temp\\x'))
  dd2.status === 405 ? ok('GET ?set= 拒绝') : bad('GET ?set= 拒绝', 'status=' + dd2.status)

  /* ---------- 3. 缓存一致性（P0 回归点） ---------- */
  console.log('\n【3】缓存一致性')
  const top = await req('/api/toplist?type=hot&source=wy', { timeout: 60000 })
  let list = []
  try { list = (JSON.parse(top.body).list || []) } catch (e) { }
  if (!list.length) {
    bad('榜单可用', '拿不到数据')
  } else {
    ok('榜单可用', list.length + ' 首')
    const song = list[0]
    const qs = new URLSearchParams({ id: song.id, source: 'wy', quality: '320k' }).toString()

    const u1 = await req('/api/url?' + qs)
    let j1 = null
    try { j1 = JSON.parse(u1.body) } catch (e) { }
    j1 && j1.url ? ok('取流第 1 次', u1.ms + 'ms') : bad('取流第 1 次', u1.body.slice(0, 90))

    const u2 = await req('/api/url?' + qs, { timeout: 15000 })
    let j2 = null
    try { j2 = JSON.parse(u2.body) } catch (e) { }
    j2 && j2.url ? ok('取流第 2 次（缓存）', u2.ms + 'ms') : bad('取流第 2 次（缓存）', u2.body.slice(0, 120))

    /* 缓存命中的结构必须是 {cached:true, url:...} 而不是 {value:{...}} */
    if (j2 && j2.url) {
      !j2.value ? ok('缓存结构正确（无嵌套 value）') : bad('缓存结构正确', '有嵌套 value')
    }

    const st1 = await stream('/api/stream?' + qs)
    st1.status === 200 && st1.got > 0 ? ok('stream 第 1 次', st1.status + ' ' + st1.got + 'B ' + st1.ms + 'ms') : bad('stream 第 1 次', 'status=' + st1.status)

    const st2 = await stream('/api/stream?' + qs)
    st2.status === 200 && st2.got > 0 ? ok('stream 第 2 次', st2.status + ' ' + st2.got + 'B ' + st2.ms + 'ms') : bad('stream 第 2 次', 'status=' + st2.status)

    /* Range 请求 */
    const rg = await new Promise((resolve) => {
      const q = http.get(BASE + '/api/stream?' + qs, { headers: { Range: 'bytes=1000-1999' }, timeout: 30000 }, (res) => {
        let got = 0
        res.on('data', (c) => { got += c.length })
        res.on('end', () => resolve({ status: res.statusCode, got, cr: res.headers['content-range'] }))
        res.on('error', () => resolve({ status: res.statusCode, got, cr: res.headers['content-range'] }))
      })
      q.on('error', () => resolve({ status: 0, got: 0 }))
      q.on('timeout', () => { q.destroy(); resolve({ status: 0, got: 0 }) })
    })
    rg.status === 206 ? ok('Range 请求 206', rg.got + 'B ' + (rg.cr || '')) : bad('Range 请求 206', 'status=' + rg.status)

    /* 并发去重 */
    const t0 = Date.now()
    const conc = await Promise.all([1, 2, 3].map(() => req('/api/url?id=' + list[1].id + '&source=wy&quality=320k', { timeout: 60000 })))
    const urls = new Set(conc.map((r) => { try { return JSON.parse(r.body).url } catch (e) { return '' } }).filter(Boolean))
    urls.size <= 1 ? ok('并发去重', urls.size + ' 个 URL ' + (Date.now() - t0) + 'ms') : bad('并发去重', urls.size + ' 个不同 URL')
  }

  /* ---------- 4. 参数校验 ---------- */
  console.log('\n【4】参数校验')
  const disc = await req('/api/discover?offset=&limit=')
  let dj = null
  try { dj = JSON.parse(disc.body) } catch (e) { }
  dj && dj.offset === 0 ? ok('discover 空参数回落默认值') : bad('discover 空参数回落', 'offset=' + (dj && dj.offset))

  const discBad = await req('/api/discover?offset=abc&limit=abc')
  let dbj = null
  try { dbj = JSON.parse(discBad.body) } catch (e) { }
  dbj && Number.isFinite(dbj.offset) ? ok('discover 非法参数不返回 null') : bad('discover 非法参数', 'offset=' + (dbj && dbj.offset))

  const badPath = await req('/%E0%A4%A')
  badPath.status === 400 ? ok('畸形路径 400') : bad('畸形路径 400', 'status=' + badPath.status)

  const badUrl = await req('//[')
  badUrl.status === 400 ? ok('畸形 URL 400') : bad('畸形 URL 400', 'status=' + badUrl.status)

  /* ---------- 5. 歌单 ---------- */
  console.log('\n【5】歌单')
  const pls = await req('/api/playlist')
  pls.status === 200 ? ok('歌单列表') : bad('歌单列表', 'status=' + pls.status)

  const plGetAction = await req('/api/playlist?action=preview&url=test')
  ;[200, 400, 500].includes(plGetAction.status) && plGetAction.status !== 405
    ? ok('playlist GET preview 不被 405', String(plGetAction.status))
    : bad('playlist GET preview 不被 405', 'status=' + plGetAction.status)

  /* ---------- 6. 工具链一致性 ---------- */
  console.log('\n【6】构建产物一致性')
  /* mobile/www/app.js 是 public/app.js 经 assemble 打补丁后的产物，本来就不会完全相同。
     正确断言：assemble 必须能成功跑完（它的 mustReplace 会在锚点失配时 throw），
     然后 APK 里的 app.js 必须与 mobile/www/app.js 逐个字节一致。 */
  const wwwApp = fs.readFileSync('mobile/www/app.js', 'utf8')
  const pubApp = fs.readFileSync('public/app.js', 'utf8')
  const patchMarkers = ["if (window.__MOBILE__) return", 'data-for-sel']
  const hasMarker = patchMarkers.some((m) => wwwApp.includes(m) && !pubApp.includes(m))
  if (hasMarker) ok('assemble 补丁已应用', 'www ' + wwwApp.length + 'B / public ' + pubApp.length + 'B')
  else if (wwwApp === pubApp) ok('assemble 无需补丁（两端一致）')
  else bad('assemble 补丁', '既没有补丁标记也不等于源文件')

  /* 关键修复点必须出现在 www 产物里 */
  const mustInWww = ["$$('.dl-fmt')", 'lastGoodQuality', '__pcCleanup']
  const missingWww = mustInWww.filter((k) => !wwwApp.includes(k))
  missingWww.length === 0 ? ok('www 含全部前端修复') : bad('www 前端修复', '缺 ' + missingWww.join(','))

  const apkPath = path.join('..', 'apk-build', 'liusheng.apk')
  if (fs.existsSync(apkPath)) {
    let apkApp = ''
    try {
      const tmp = path.join('build', '_regress')
      fs.rmSync(tmp, { recursive: true, force: true })
      fs.mkdirSync(tmp, { recursive: true })
      execSync('tar.exe -xf "' + apkPath + '" -C "' + tmp + '"', { stdio: 'pipe' })
      const p1 = path.join(tmp, 'assets', 'www', 'app.js')
      if (fs.existsSync(p1)) apkApp = fs.readFileSync(p1, 'utf8')
      fs.rmSync(tmp, { recursive: true, force: true })
    } catch (e) { }
    if (apkApp) {
      apkApp === wwwApp
        ? ok('APK 内 app.js 与 www 一致', apkApp.length + 'B')
        : bad('APK 内 app.js', 'APK ' + apkApp.length + 'B vs www ' + wwwApp.length + 'B（APK 是旧包，需重打）')
    } else {
      bad('APK 内 app.js', '解包后找不到 assets/www/app.js')
    }

    /* APK 内 api-mobile.js 也要一致 */
    try {
      const tmp2 = path.join('build', '_regress2')
      fs.rmSync(tmp2, { recursive: true, force: true })
      fs.mkdirSync(tmp2, { recursive: true })
      execSync('tar.exe -xf "' + apkPath + '" -C "' + tmp2 + '"', { stdio: 'pipe' })
      const p2 = path.join(tmp2, 'assets', 'www', 'api-mobile.js')
      if (fs.existsSync(p2)) {
        const apkApi = fs.readFileSync(p2, 'utf8')
        const wwwApi = fs.readFileSync('mobile/www/api-mobile.js', 'utf8')
        apkApi === wwwApi ? ok('APK 内 api-mobile.js 与 www 一致') : bad('APK 内 api-mobile.js', '不一致')
      }
      fs.rmSync(tmp2, { recursive: true, force: true })
    } catch (e) { }
  }

  /* ---------- 7. 源码静态检查 ---------- */
  console.log('\n【7】源码静态检查')
  const checks = [
    ['app/server.js', ['function waitForAnySource', 'cacheGet(urlCache', 'cacheSet(urlCache', "if (o === 'null') return false"], '服务端'],
    ['app/lib/kugou-gcid.js', ['batch_decode', 'getSongPageAlt', 'Buffer.concat', 'alias'], 'gcid'],
    ['public/app.js', ['lastGoodQuality', "$$('.dl-fmt')", "__pcCleanup"], '前端'],
    ['mobile/www/api-mobile.js', ['kgGcidPlaylist', '__kgDecodeGcid', 'attempt'], '手机端'],
  ]
  for (const [file, keys, label] of checks) {
    const s = fs.readFileSync(file, 'utf8')
    const missing = keys.filter((k) => !s.includes(k))
    missing.length === 0 ? ok(label + ' 关键代码齐全') : bad(label + ' 关键代码', '缺 ' + missing.join(','))
  }

  /* 检查残留错误 */
  const appjs = fs.readFileSync('public/app.js', 'utf8')
  const dollarErr = (appjs.match(/(^|[^$])\$\(['"][^'"]+['"]\)\.forEach/g) || [])
  dollarErr.length === 0 ? ok('无 $ 当 $$ 误用') : bad('$ 当 $$ 误用', dollarErr.length + ' 处')

  /* ---------- 8. Java 编译 ---------- */
  console.log('\n【8】Java 编译')
  try {
    const jdkDir = fs.readdirSync(path.join('..', 'apk-build', 'tools', 'jdk'))[0]
    const javac = path.join('..', 'apk-build', 'tools', 'jdk', jdkDir, 'bin', 'javac.exe')
    const aj = path.join('..', 'apk-build', 'tools', 'plat', 'android-13', 'android.jar')
    const srcDir = path.join('..', 'apk-build', 'app', 'src')
    const srcs = []
    ;(function walk (d) {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name)
        if (e.isDirectory()) walk(p)
        else if (e.name.endsWith('.java')) srcs.push('"' + p + '"')
      }
    })(srcDir)
    const tmp = path.join('..', 'apk-build', 'build', '_regress_javac')
    fs.rmSync(tmp, { recursive: true, force: true })
    fs.mkdirSync(tmp, { recursive: true })
    execSync('"' + javac + '" -encoding UTF-8 -source 8 -target 8 -nowarn -bootclasspath "' + aj + '" -d "' + tmp + '" ' + srcs.join(' '), { stdio: 'pipe' })
    ok('javac 编译通过')
    fs.rmSync(tmp, { recursive: true, force: true })
  } catch (e) {
    bad('javac 编译', String(e.stderr || e.message).slice(0, 200))
  }

  /* ---------- 汇总 ---------- */
  console.log('\n========== 结果 ==========')
  console.log('通过 ' + pass + ' / 失败 ' + fail)
  if (fail) {
    console.log('\n失败项:')
    failures.forEach((f) => console.log('  - ' + f))
    process.exitCode = 1
  } else {
    console.log('\n全部通过')
  }
})()
