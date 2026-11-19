'use strict'
/* 冷启动切歌延迟对比：重启服务后立刻点歌 */
const path = require('node:path')
const http = require('node:http')
const { spawn } = require('node:child_process')
process.chdir(path.resolve(__dirname, '..'))

const BASE = 'http://127.0.0.1:37621'
const NODE = path.join(process.cwd(), 'runtime', 'node.exe')

function get (p, timeout = 60000) {
  return new Promise((resolve) => {
    const t0 = Date.now()
    const q = http.get(BASE + p, { timeout }, (res) => {
      let d = ''
      res.on('data', (c) => { d += c })
      res.on('end', () => resolve({ status: res.statusCode, body: d, ms: Date.now() - t0 }))
    })
    q.on('error', (e) => resolve({ status: 0, err: e.message, ms: Date.now() - t0 }))
    q.on('timeout', () => { q.destroy(); resolve({ status: 0, err: 'timeout', ms: Date.now() - t0 }) })
  })
}

function sleep (ms) { return new Promise((r) => setTimeout(r, ms)) }

;(async () => {
  console.log('=== 杀旧进程 ===')
  try {
    const { execSync } = require('node:child_process')
    execSync('powershell -NoProfile -Command "Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Path -like \'*lx-music*\' } | Stop-Process -Force"', { stdio: 'pipe' })
  } catch (e) { }
  await sleep(2000)

  console.log('=== 启动新服务 ===')
  const child = spawn(NODE, ['app/server.js'], { cwd: process.cwd(), detached: true, stdio: 'ignore' })
  child.unref()

  /* 等端口起来（但不音源加载完） */
  const tStart = Date.now()
  let up = false
  for (let i = 0; i < 100; i++) {
    await sleep(300)
    const h = await get('/api/health', 2000)
    if (h.status === 200) { up = true; break }
  }
  console.log('  服务起来用了 ' + (Date.now() - tStart) + 'ms')
  if (!up) { console.log('  起不来，退出'); return }

  /* 立刻点歌（模拟冷启动） */
  console.log('\n=== 冷启动立刻点歌 ===')
  const kgId = '1F0FD0A0C6D7D6A4C4E4F5B5C5D5E5F5'   /* 占位，下面用榜单里的 */
  const top = await get('/api/toplist?type=hot&source=kg')
  let list = []
  try { list = JSON.parse(top.body).list || [] } catch (e) { }
  if (!list.length) { console.log('  拿不到榜单'); return }

  const s0 = list[0]
  const qs = new URLSearchParams({ id: s0.id, source: 'kg', quality: '320k', name: s0.name, singer: s0.singer || '' })
  const r1 = await get('/api/url?' + qs.toString(), 60000)
  let j1 = null
  try { j1 = JSON.parse(r1.body) } catch (e) { }
  console.log('  第 1 首（冷）: ' + r1.ms + 'ms  ' + (j1 && j1.url ? '✓' : '✗') + '  ' + (j1 && j1.provider || ''))

  /* 第二首 */
  if (list[1]) {
    const qs2 = new URLSearchParams({ id: list[1].id, source: 'kg', quality: '320k', name: list[1].name, singer: list[1].singer || '' })
    const r2 = await get('/api/url?' + qs2.toString(), 60000)
    let j2 = null
    try { j2 = JSON.parse(r2.body) } catch (e) { }
    console.log('  第 2 首: ' + r2.ms + 'ms  ' + (j2 && j2.url ? '✓' : '✗') + '  ' + (j2 && j2.provider || ''))
  }

  /* 第三首 */
  if (list[2]) {
    const qs3 = new URLSearchParams({ id: list[2].id, source: 'kg', quality: '320k', name: list[2].name, singer: list[2].singer || '' })
    const r3 = await get('/api/url?' + qs3.toString(), 60000)
    let j3 = null
    try { j3 = JSON.parse(r3.body) } catch (e) { }
    console.log('  第 3 首: ' + r3.ms + 'ms  ' + (j3 && j3.url ? '✓' : '✗') + '  ' + (j3 && j3.provider || ''))
  }

  console.log('\n=== 音源就绪情况 ===')
  const src = await get('/api/sources', 15000)
  try {
    const j = JSON.parse(src.body)
    const ok = (j.list || []).filter((x) => x.status === 'ok').length
    console.log('  ' + ok + '/' + (j.list || []).length + ' 个音源已就绪')
  } catch (e) { }
})()
