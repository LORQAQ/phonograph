'use strict'
/**
 * 实测 P0-1：写盘失败后是否真的会重试
 * 做法：把 data 目录临时改名成不可写，POST 改设置，
 *       观察服务端是否在预期时间内重试，恢复后再验证最终落盘。
 */
const path = require('node:path')
const fs = require('node:fs')
const http = require('node:http')
const { spawn } = require('node:child_process')
process.chdir(path.resolve(__dirname, '..'))

const NODE = path.join(process.cwd(), 'runtime', 'node.exe')
const PORT = 37811
const BASE = 'http://127.0.0.1:' + PORT
const DATA = path.join(process.cwd(), 'data')
const DATA_BAK = path.join(process.cwd(), 'data_tmpbak')

function req (method, p, body) {
  return new Promise((resolve) => {
    const data = body ? Buffer.from(JSON.stringify(body), 'utf8') : null
    const q = http.request(BASE + p, {
      method, timeout: 15000,
      headers: Object.assign({ 'Content-Type': 'application/json' }, data ? { 'Content-Length': data.length } : {}),
    }, (res) => {
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

;(async () => {
  console.log('================ P0-1 写盘重试实测 ================\n')

  /* 起一个独立端口的实例，避免影响正在跑的 */
  console.log('启动测试实例 :' + PORT)
  const child = spawn(NODE, ['app/server.js'], {
    cwd: process.cwd(), env: Object.assign({}, process.env, { PORT: String(PORT) }),
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stderr = ''
  child.stderr.on('data', (d) => { stderr += d.toString() })
  child.stdout.on('data', () => { })

  /* 等就绪 */
  let up = false
  for (let i = 0; i < 60; i++) {
    await sleep(500)
    const h = await req('GET', '/api/health')
    if (h.status === 200) { up = true; break }
  }
  if (!up) { console.log('✗ 服务没起来'); child.kill(); return }
  console.log('  ✓ 服务就绪')

  /* 读取当前 quality */
  const before = await req('GET', '/api/settings')
  let q0 = null
  try { q0 = JSON.parse(before.body).quality } catch (e) { }
  console.log('  初始 quality = ' + q0)

  /* 正常保存一次，看有没有假的「写盘失败」日志 */
  stderr = ''
  const ok1 = await req('POST', '/api/settings', { volume: 0.77 })
  await sleep(1500)
  console.log('\n[1] 正常保存')
  console.log('    接口: ' + ok1.status)
  const fakeErr = /dbRetry is not defined/.test(stderr)
  console.log('    假报错(dbRetry): ' + (fakeErr ? '✗ 还在' : '✓ 已消失'))
  if (stderr.trim()) console.log('    stderr: ' + stderr.trim().split('\n').slice(0, 3).join(' | '))

  /* 制造写盘失败：把 data 目录改成文件 */
  console.log('\n[2] 制造写盘失败')
  let madeFail = false
  try {
    if (fs.existsSync(DATA)) { fs.renameSync(DATA, DATA_BAK); madeFail = true }
    /* 放一个同名文件，让 mkdir/copy 必然失败 */
    fs.writeFileSync(DATA, 'block')
    console.log('    data 已替换成文件')
  } catch (e) {
    console.log('    ✗ 无法制造失败: ' + e.message)
  }

  if (madeFail) {
    stderr = ''
    const ok2 = await req('POST', '/api/settings', { volume: 0.33 })
    console.log('    接口: ' + ok2.status + '（预期 200，错误在后台）')
    await sleep(2500)

    const hasRetryLog = /写盘失败/.test(stderr)
    const hasRefErr = /dbRetry is not defined/.test(stderr)
    console.log('    有「写盘失败」日志: ' + (hasRetryLog ? '✓' : '✗'))
    console.log('    有 ReferenceError: ' + (hasRefErr ? '✗ 还有' : '✓ 已消失'))

    /* 恢复 data 目录，看重试是否会把数据补写回去 */
    console.log('\n[3] 恢复目录，观察自动重试')
    try {
      fs.unlinkSync(DATA)
      fs.renameSync(DATA_BAK, DATA)
      console.log('    data 已恢复')
    } catch (e) { console.log('    ✗ 恢复失败: ' + e.message) }

    /* 等重试（第一次退避 2s、第二次 4s，最多等 20s） */
    let recovered = false
    for (let i = 0; i < 20; i++) {
      await sleep(1000)
      try {
        const j = JSON.parse(fs.readFileSync(path.join(DATA, 'db.json'), 'utf8'))
        const v = j && j.settings ? j.settings.volume : j.volume
        if (Number(v) === 0.33) { recovered = true; break }
      } catch (e) { }
    }
    console.log('    自动重试落盘: ' + (recovered ? '✓ 成功（volume=0.33 已写入）' : '✗ 没写进去'))
  }

  child.kill()
  await sleep(500)

  /* 清理 */
  try { if (fs.existsSync(DATA_BAK)) fs.renameSync(DATA_BAK, DATA) } catch (e) { }

  console.log('\n================ 结论 ================')
  console.log('P0-1 是否修好，看上面「假报错」和「自动重试落盘」两项')
})()