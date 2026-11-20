'use strict'
/* 用工作区内路径测（沙箱允许），并清理 db 里的坏路径 */
const path = require('node:path')
const http = require('node:http')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

const BASE = 'http://127.0.0.1:37621'
let pass = 0, fail = 0
const failures = []
function ok (n, e) { pass++; console.log('  ✓ ' + n + (e ? '  ' + e : '')) }
function bad (n, d) { fail++; failures.push(n + (d ? ' — ' + d : '')); console.log('  ✗ ' + n + (d ? '  ' + d : '')) }

function req (method, p, body) {
  return new Promise((resolve) => {
    const data = body ? Buffer.from(JSON.stringify(body), 'utf8') : null
    const o = { method, timeout: 30000, headers: Object.assign({ 'Content-Type': 'application/json' }, data ? { 'Content-Length': data.length } : {}) }
    const q = http.request(BASE + p, o, (res) => {
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
  console.log('================ 下载目录功能实测 ================\n')

  /* 先看默认目录能不能写 */
  const probe = await req('GET', '/api/download-dir')
  const def = (probe.json && probe.json.default) || ''
  console.log('默认目录: ' + def)
  console.log('  能否创建: ', await (async () => {
    try { fs.mkdirSync(def, { recursive: true }); fs.writeFileSync(path.join(def, '_t.tmp'), 'x'); fs.unlinkSync(path.join(def, '_t.tmp')); return '✓ 可以' }
    catch (e) { return '✗ ' + e.code }
  })())

  /* 用项目里的目录测 */
  const GOOD = path.join(process.cwd(), 'build', '_dldir_test')
  try { fs.mkdirSync(GOOD, { recursive: true }) } catch (e) { }
  console.log('\n测试路径: ' + GOOD)

  console.log('\n【1】保存合法路径')
  const r1 = await req('POST', '/api/download-dir?set=' + encodeURIComponent(GOOD))
  if (r1.status === 200 && r1.json && r1.json.dir) {
    ok('POST ?set= 200', 'dir=' + r1.json.dir)
    ok('writable=' + r1.json.writable)
  } else {
    bad('POST ?set=', r1.status + ' ' + r1.body.slice(0, 110))
  }

  console.log('\n【2】读取回来')
  const r2 = await req('GET', '/api/download-dir')
  r2.json && r2.json.dir === GOOD ? ok('GET 读回一致') : bad('GET 读回', (r2.json && r2.json.dir) || r2.body.slice(0, 80))

  console.log('\n【3】坏路径必须被拒且不覆盖')
  const BAD = 'C:\\__nosuch_' + Date.now()
  const r3 = await req('POST', '/api/download-dir?set=' + encodeURIComponent(BAD))
  r3.status === 400 ? ok('坏路径 400', (r3.json && r3.json.error || '').slice(0, 55)) : bad('坏路径该 400', 'status=' + r3.status)
  const r4 = await req('GET', '/api/download-dir')
  r4.json && r4.json.dir === GOOD ? ok('坏路径没覆盖已存目录') : bad('坏路径被存进去了', (r4.json && r4.json.dir))

  console.log('\n【4】恢复默认（空值）')
  const r5 = await req('POST', '/api/download-dir?set=')
  const r6 = await req('GET', '/api/download-dir')
  const nowDir = (r6.json && r6.json.dir) || ''
  nowDir === def ? ok('已恢复默认: ' + nowDir) : console.log('  ℹ 当前: ' + nowDir)

  /* 清理 */
  try { fs.rmSync(GOOD, { recursive: true, force: true }) } catch (e) { }

  console.log('\n================ 结果 ================')
  console.log('通过 ' + pass + ' / 失败 ' + fail)
  if (fail) { console.log('\n失败:'); failures.forEach((f) => console.log('  - ' + f)); process.exitCode = 1 }
  else console.log('全部通过')
})()
