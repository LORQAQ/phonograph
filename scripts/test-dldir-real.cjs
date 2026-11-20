'use strict'
/* 用合法路径测下载目录，并验证坏路径会被正确拒绝 */
const path = require('node:path')
const http = require('node:http')
const fs = require('node:fs')
const os = require('node:os')
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
      res.on('end', () => {
        let j = null
        try { j = JSON.parse(d) } catch (e) { }
        resolve({ status: res.statusCode, body: d, json: j })
      })
    })
    q.on('error', (e) => resolve({ status: 0, err: e.message }))
    q.on('timeout', () => { q.destroy(); resolve({ status: 0, err: 'timeout' }) })
    if (data) q.write(data)
    q.end()
  })
}

;(async () => {
  console.log('================ 下载目录功能实测 ================\n')

  /* 选一个一定能创建的路径 */
  const GOOD = path.join(os.tmpdir(), 'liusheng-dl-test')
  /* 一个一定建不出来的路径（C 盘根目录下的随机名，管理员也 EPERM） */
  const BAD = 'C:\\__liusheng_should_fail_' + Date.now()

  console.log('【1】保存合法路径')
  const r1 = await req('POST', '/api/download-dir?set=' + encodeURIComponent(GOOD))
  if (r1.status === 200 && r1.json && r1.json.dir) {
    ok('POST ?set= 200', 'dir=' + r1.json.dir)
    fs.existsSync(GOOD) ? ok('目录已真实创建') : bad('目录没创建出来')
  } else {
    bad('POST ?set=', r1.status + ' ' + r1.body.slice(0, 100))
  }

  console.log('\n【2】读取回来应该是刚设的')
  const r2 = await req('GET', '/api/download-dir')
  r2.json && r2.json.dir === GOOD ? ok('GET 读回一致') : bad('GET 读回', (r2.json && r2.json.dir) || r2.body.slice(0, 80))

  console.log('\n【3】不可写路径必须被拒（不能存进 db）')
  const r3 = await req('POST', '/api/download-dir?set=' + encodeURIComponent(BAD))
  r3.status === 400 ? ok('坏路径返回 400', (r3.json && r3.json.error || '').slice(0, 60)) : bad('坏路径该 400', 'status=' + r3.status)

  const r4 = await req('GET', '/api/download-dir')
  r4.json && r4.json.dir === GOOD ? ok('坏路径没覆盖已保存的目录') : bad('坏路径被存进去了', (r4.json && r4.json.dir))

  console.log('\n【4】空值 = 恢复默认')
  const r5 = await req('POST', '/api/download-dir?set=')
  r5.status === 200 ? ok('空 set 不报错') : bad('空 set', 'status=' + r5.status)

  console.log('\n【5】GET 写操作仍被拒')
  const r6 = await req('GET', '/api/download-dir?set=' + encodeURIComponent(GOOD))
  r6.status === 405 ? ok('GET ?set= 405') : bad('GET ?set= 应 405', 'status=' + r6.status)

  console.log('\n【6】清理 + 恢复默认目录')
  const r7 = await req('POST', '/api/download-dir?set=' + encodeURIComponent(''))
  try { fs.rmSync(GOOD, { recursive: true, force: true }) } catch (e) { }
  const r8 = await req('GET', '/api/download-dir')
  console.log('  当前下载目录: ' + ((r8.json && r8.json.dir) || '?'))
  console.log('  默认目录:     ' + ((r8.json && r8.json.default) || '?'))

  console.log('\n================ 结果 ================')
  console.log('通过 ' + pass + ' / 失败 ' + fail)
  if (fail) { console.log('\n失败:'); failures.forEach((f) => console.log('  - ' + f)); process.exitCode = 1 }
  else console.log('全部通过')
})()
