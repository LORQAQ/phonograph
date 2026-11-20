'use strict'
/* 实测所有写接口：GET 必须 405，POST 必须通 */
const path = require('node:path')
const http = require('node:http')
process.chdir(path.resolve(__dirname, '..'))

const BASE = 'http://127.0.0.1:37621'
let pass = 0, fail = 0
const failures = []

function req (method, p, body) {
  return new Promise((resolve) => {
    const data = body ? Buffer.from(JSON.stringify(body), 'utf8') : null
    const o = {
      method,
      timeout: 30000,
      headers: Object.assign({ 'Content-Type': 'application/json' }, data ? { 'Content-Length': data.length } : {}),
    }
    const q = http.request(BASE + p, o, (res) => {
      let d = ''
      res.on('data', (c) => { d += c })
      res.on('end', () => resolve({ status: res.statusCode, body: d }))
    })
    q.on('error', (e) => resolve({ status: 0, err: e.message }))
    q.on('timeout', () => { q.destroy(); resolve({ status: 0, err: 'timeout' }) })
    if (data) q.write(data)
    q.end()
  })
}

function ok (n, e) { pass++; console.log('  ✓ ' + n + (e ? '  ' + e : '')) }
function bad (n, d) { fail++; failures.push(n + (d ? ' — ' + d : '')); console.log('  ✗ ' + n + (d ? '  ' + d : '')) }

;(async () => {
  console.log('================ 写接口 method 实测 ================\n')

  /* 0. 服务在线 */
  const h = await req('GET', '/api/health')
  console.log('【0】服务')
  if (h.status !== 200) { console.log('  服务没起来: ' + (h.err || h.status)); process.exit(1) }
  let hv = null
  try { hv = JSON.parse(h.body) } catch (e) { }
  ok('health 200', 'version=' + (hv && hv.version))

  /* 1. 下载目录 —— 用户截图里报错的那个 */
  console.log('\n【1】下载目录（用户报错的）')
  const d1 = await req('GET', '/api/download-dir')
  d1.status === 200 ? ok('GET 读取 200', d1.body.slice(0, 60)) : bad('GET 读取', 'status=' + d1.status)

  /* 用工作区内路径 —— C:\Temp 在当前沙箱下 EPERM，会误判成代码问题 */
  const GOOD_DIR = path.join(process.cwd(), 'build', '_wm_test')
  const d2 = await req('POST', '/api/download-dir?set=' + encodeURIComponent(GOOD_DIR))
  d2.status === 200 ? ok('POST ?set= 成功', d2.body.slice(0, 80)) : bad('POST ?set=', 'status=' + d2.status + ' ' + d2.body.slice(0, 80))

  const d3 = await req('GET', '/api/download-dir?set=' + encodeURIComponent(GOOD_DIR))
  d3.status === 405 ? ok('GET ?set= 仍被拒 405（正确）') : bad('GET ?set= 应该 405', 'status=' + d3.status)

  /* 2. 删除已下载文件 */
  console.log('\n【2】downloads/remove')
  const r1 = await req('GET', '/api/downloads/remove?name=__nope__.mp3')
  r1.status === 405 ? ok('GET 被拒 405（正确）') : bad('GET 应该 405', 'status=' + r1.status)

  const r2 = await req('POST', '/api/downloads/remove?name=__nope__.mp3')
  ;[200, 404, 400].includes(r2.status) ? ok('POST 通（文件不存在返回 ' + r2.status + '）', r2.body.slice(0, 60)) : bad('POST remove', 'status=' + r2.status)

  /* 3. 打开下载文件夹 */
  console.log('\n【3】downloads/reveal')
  const v1 = await req('GET', '/api/downloads/reveal?name=__nope__.mp3')
  v1.status === 405 ? ok('GET 被拒 405（正确）') : bad('GET 应该 405', 'status=' + v1.status)

  const v2 = await req('POST', '/api/downloads/reveal?name=__nope__.mp3')
  ;[200, 404, 400].includes(v2.status) ? ok('POST 通（' + v2.status + '）', v2.body.slice(0, 60)) : bad('POST reveal', 'status=' + v2.status)

  /* 4. 音源测速 */
  console.log('\n【4】sources/test')
  const t1 = await req('GET', '/api/sources/test?id=1&source=wy')
  t1.status === 405 ? ok('GET 被拒 405（正确）') : bad('GET 应该 405', 'status=' + t1.status)

  const t2 = await req('POST', '/api/sources/test?id=1&source=wy')
  ;[200, 400, 500].includes(t2.status) ? ok('POST 通（' + t2.status + '）') : bad('POST test', 'status=' + t2.status)

  /* 5. 其他写接口不能被误伤 */
  console.log('\n【5】其他写接口回归')
  const s1 = await req('POST', '/api/settings', { volume: 0.8 })
  s1.status === 200 ? ok('POST /api/settings', '') : bad('POST settings', 'status=' + s1.status)

  const p1 = await req('POST', '/api/playlist', { action: 'preview', url: 'x' })
  ;[200, 400, 500].includes(p1.status) ? ok('POST /api/playlist（' + p1.status + '）') : bad('POST playlist', 'status=' + p1.status)

  console.log('\n【6】读接口不能被误伤')
  for (const [m, p2] of [['GET', '/api/playlist'], ['GET', '/api/sources'], ['GET', '/api/settings'], ['GET', '/api/downloads'], ['GET', '/api/db'], ['GET', '/api/lan']]) {
    const r = await req(m, p2)
    r.status === 200 ? ok(m + ' ' + p2) : bad(m + ' ' + p2, 'status=' + r.status)
  }

  console.log('\n================ 结果 ================')
  console.log('通过 ' + pass + ' / 失败 ' + fail)
  if (fail) { console.log('\n失败项:'); failures.forEach((f) => console.log('  - ' + f)); process.exitCode = 1 }
  else console.log('全部通过')
})()
