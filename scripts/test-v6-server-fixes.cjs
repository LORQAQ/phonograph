'use strict'
/* 实测第六轮服务端修复 */
const path = require('node:path')
const http = require('node:http')
process.chdir(path.resolve(__dirname, '..'))

const BASE = 'http://127.0.0.1:37621'
let pass = 0, fail = 0
const failures = []
function ok (n, e) { pass++; console.log('  ✓ ' + n + (e ? '  ' + e : '')) }
function bad (n, d) { fail++; failures.push(n + (d ? ' — ' + d : '')); console.log('  ✗ ' + n + (d ? '  ' + d : '')) }

function req (method, p, body, timeout) {
  return new Promise((resolve) => {
    const data = body !== undefined ? Buffer.from(JSON.stringify(body), 'utf8') : null
    const q = http.request(BASE + p, {
      method, timeout: timeout || 30000,
      headers: Object.assign({ 'Content-Type': 'application/json' }, data ? { 'Content-Length': data.length } : {}),
    }, (res) => {
      let d = ''
      res.on('data', (c) => { d += c })
      res.on('end', () => { let j = null; try { j = JSON.parse(d) } catch (e) { } resolve({ status: res.statusCode, body: d, json: j }) })
    })
    q.on('error', (e) => resolve({ status: 0, err: e.message }))
    q.on('timeout', () => { q.destroy(); resolve({ status: 0, err: 'timeout' }) })
    if (data) q.write(data)
    q.end()
  })
}

;(async () => {
  console.log('================ 第六轮服务端实测 ================\n')

  const h = await req('GET', '/api/health')
  if (h.status !== 200) { console.log('服务没起来'); process.exit(1) }
  ok('health 200', 'v' + (h.json && h.json.version))

  /* 1. S4: /api/download?save=1 必须 POST */
  console.log('\n【1】S4 下载落盘需要 POST')
  const d1 = await req('GET', '/api/download?save=1&id=x&source=wy')
  d1.status === 405 ? ok('GET save=1 被拒 405') : bad('GET save=1 应 405', 'status=' + d1.status)
  const d2 = await req('POST', '/api/download?save=1&id=__nope__&source=wy')
  ;[400, 404, 500].includes(d2.status) ? ok('POST 进了处理逻辑（' + d2.status + '）') : bad('POST 应该进逻辑', 'status=' + d2.status)

  /* 2. S6: /api/settings 键白名单 + downloadDir 校验 */
  console.log('\n【2】S6 设置键白名单')
  const bad1 = await req('POST', '/api/settings', { downloadDir: 'Z:\\__no_such_dir__\\x' })
  bad1.status === 400 ? ok('坏目录被拒 400', (bad1.json && bad1.json.error || '').slice(0, 50)) : bad('坏目录应 400', 'status=' + bad1.status)

  const bad2 = await req('POST', '/api/settings', { __junkKey: 'x', volume: 0.66 })
  bad2.status === 200 ? ok('未知键不报错') : bad('未知键', 'status=' + bad2.status)
  const after = await req('GET', '/api/settings')
  const hasJunk = after.body.includes('__junkKey')
  !hasJunk ? ok('未知键没落库') : bad('未知键被写进去了')

  /* 3. S5: sameOrigin 的 Host 白名单（DNS rebinding） */
  console.log('\n【3】S5 Host 白名单')
  const rebind = await new Promise((resolve) => {
    /* 直接构造 Host: evil.example + Origin: http://evil.example */
    const q = http.request({ hostname: '127.0.0.1', port: 37621, path: '/api/health', method: 'GET',
      headers: { Host: 'evil.example', Origin: 'http://evil.example' }, timeout: 8000 }, (res) => {
      let d = ''
      res.on('data', (c) => { d += c })
      res.on('end', () => resolve({ status: res.statusCode }))
    })
    q.on('error', () => resolve({ status: 0 }))
    q.end()
  })
  rebind.status === 403 ? ok('rebinding 被拒 403') : bad('rebinding 应 403', 'status=' + rebind.status)

  const normal = await new Promise((resolve) => {
    const q = http.request({ hostname: '127.0.0.1', port: 37621, path: '/api/health', method: 'GET',
      headers: { Host: '127.0.0.1:37621', Origin: 'http://127.0.0.1:37621' }, timeout: 8000 }, (res) => {
      let d = ''
      res.on('data', (c) => { d += c })
      res.on('end', () => resolve({ status: res.statusCode }))
    })
    q.on('error', () => resolve({ status: 0 }))
    q.end()
  })
  normal.status === 200 ? ok('正常本机请求放行') : bad('正常请求被拦', 'status=' + normal.status)

  /* 4. S7/force: /api/url?force=1 绕过缓存 */
  console.log('\n【4】force=1 绕过缓存')
  const top = await req('GET', '/api/toplist?type=hot&source=wy', undefined, 60000)
  let list = []
  try { list = (JSON.parse(top.body).list || []) } catch (e) { }
  if (list.length) {
    const s = list[0]
    const qs = 'id=' + s.id + '&source=wy&quality=320k'
    const r1 = await req('GET', '/api/url?' + qs, undefined, 60000)
    const r2 = await req('GET', '/api/url?' + qs, undefined, 30000)
    const r3 = await req('GET', '/api/url?' + qs + '&force=1', undefined, 60000)
    let j2 = null, j3 = null
    try { j2 = JSON.parse(r2.body) } catch (e) { }
    try { j3 = JSON.parse(r3.body) } catch (e) { }
    j2 && j2.cached === true ? ok('第二次命中缓存（' + r2.ms + 'ms）') : console.log('  ℹ 第二次 cached=' + (j2 && j2.cached))
    j3 && j3.cached !== true ? ok('force=1 绕过缓存（' + r3.ms + 'ms）') : bad('force=1 没绕过缓存', JSON.stringify(j3).slice(0, 80))
  } else {
    console.log('  ℹ 拿不到榜单，跳过')
  }

  /* 5. S1: /api/sources/test 有超时 */
  console.log('\n【5】S1 音源测速超时')
  const t1 = await req('GET', '/api/sources/test?id=x&source=wy')
  t1.status === 405 ? ok('GET 被拒（在写名单里）') : console.log('  ℹ GET status=' + t1.status)
  const t0 = Date.now()
  const t2 = await req('POST', '/api/sources/test?id=347230&source=wy', {}, 40000)
  const el = Date.now() - t0
  if (el <= 16000) ok('POST 在 16 秒内返回（' + el + 'ms, status=' + t2.status + '）')
  else bad('POST 耗时 ' + el + 'ms，超时保护可能没生效')

  console.log('\n================ 结果 ================')
  console.log('通过 ' + pass + ' / 失败 ' + fail)
  if (fail) { console.log('\n失败:'); failures.forEach((f) => console.log('  - ' + f)); process.exitCode = 1 }
  else console.log('全部通过')
})()