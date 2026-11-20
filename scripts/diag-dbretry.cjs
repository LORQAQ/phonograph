'use strict'
/* 诊断：写盘失败后的重试链 */
const path = require('node:path')
const fs = require('node:fs')
const http = require('node:http')
const { spawn } = require('node:child_process')
process.chdir(path.resolve(__dirname, '..'))

const NODE = path.join(process.cwd(), 'runtime', 'node.exe')
const PORT = 37813
const BASE = 'http://127.0.0.1:' + PORT
const DATA = path.join(process.cwd(), 'data')
const BAK = path.join(process.cwd(), 'data_bak2')

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
    if (data) q.write(data)
    q.end()
  })
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

;(async () => {
  const child = spawn(NODE, ['app/server.js'], {
    cwd: process.cwd(), env: Object.assign({}, process.env, { PORT: String(PORT) }),
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let log = ''
  child.stderr.on('data', (d) => { log += d.toString() })
  child.stdout.on('data', (d) => { log += d.toString() })

  for (let i = 0; i < 60; i++) { await sleep(500); const h = await req('GET', '/api/health'); if (h.status === 200) break }
  console.log('服务就绪\n')

  /* 制造失败 */
  if (fs.existsSync(DATA)) fs.renameSync(DATA, BAK)
  fs.writeFileSync(DATA, 'block')
  log = ''
  const r = await req('POST', '/api/settings', { volume: 0.11 })
  console.log('POST → ' + r.status)
  await sleep(3000)
  console.log('--- 3 秒后 stderr ---')
  console.log(log.trim() || '(空)')

  /* 恢复，然后每秒看一次 */
  fs.unlinkSync(DATA)
  fs.renameSync(BAK, DATA)
  console.log('\n已恢复 data 目录，开始观察 25 秒')
  log = ''
  for (let i = 1; i <= 25; i++) {
    await sleep(1000)
    let vol = '?'
    try { vol = JSON.parse(fs.readFileSync(path.join(DATA, 'db.json'), 'utf8')).volume } catch (e) { vol = '读取失败' }
    if (i % 5 === 0 || vol === 0.11) console.log('  t=' + i + 's  volume=' + vol)
    if (vol === 0.11) { console.log('  ✓ 第 ' + i + ' 秒写入成功'); break }
  }
  console.log('\n--- 观察期 stderr ---')
  console.log(log.trim() || '(空)')

  child.kill()
  await sleep(400)
  try { if (fs.existsSync(BAK)) fs.renameSync(BAK, DATA) } catch (e) { }
})()