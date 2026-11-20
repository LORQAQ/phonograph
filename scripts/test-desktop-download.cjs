'use strict'
/* 实测电脑端下载：POST /api/download?save=1 是否真的落盘 */
const path = require('node:path')
const http = require('node:http')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

const BASE = 'http://127.0.0.1:37621'

function req (method, p, body, timeout) {
  return new Promise((resolve) => {
    const data = body !== undefined ? Buffer.from(JSON.stringify(body), 'utf8') : null
    const q = http.request(BASE + p, {
      method, timeout: timeout || 120000,
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
  console.log('================ 电脑端下载实测 ================\n')

  /* 当前下载目录 */
  const d0 = await req('GET', '/api/download-dir')
  console.log('下载目录: ' + (d0.json && d0.json.dir))
  console.log('可写: ' + (d0.json && d0.json.writable))

  /* 拿一首歌 */
  const top = await req('GET', '/api/toplist?type=hot&source=wy', undefined, 60000)
  let list = []
  try { list = JSON.parse(top.body).list || [] } catch (e) { }
  if (!list.length) { console.log('拿不到榜单'); process.exit(1) }
  const s = list[0]
  console.log('测试歌曲: ' + s.name + ' - ' + s.singer + '  (id=' + s.id + ')\n')

  const qs = 'id=' + s.id + '&source=wy&quality=320k&name=' + encodeURIComponent(s.name) +
    '&singer=' + encodeURIComponent(s.singer) + '&save=1'

  /* 1. GET 应被拒 */
  console.log('【1】GET save=1')
  const g = await req('GET', '/api/download?' + qs, undefined, 20000)
  g.status === 405 ? console.log('  ✓ 405（正确拒绝）') : console.log('  ✗ status=' + g.status)

  /* 2. POST 应该真的下载 */
  console.log('\n【2】POST save=1')
  const t0 = Date.now()
  const p = await req('POST', '/api/download?' + qs, {}, 180000)
  const el = Date.now() - t0
  console.log('  耗时 ' + el + 'ms  status=' + p.status)
  console.log('  响应: ' + String(p.body).slice(0, 300))

  if (p.json && p.json.ok) {
    console.log('\n  ✓ 下载成功')
    console.log('  文件: ' + p.json.name)
    console.log('  大小: ' + (p.json.size / 1048576).toFixed(2) + ' MB')
    console.log('  路径: ' + p.json.path)
    const exists = p.json.path && fs.existsSync(p.json.path)
    console.log('  磁盘上存在: ' + (exists ? '✓' : '✗'))
    if (exists) {
      const st = fs.statSync(p.json.path)
      console.log('  实际大小: ' + (st.size / 1048576).toFixed(2) + ' MB  ' + (st.size === p.json.size ? '✓ 与响应一致' : '✗ 不一致'))
    }
  } else {
    console.log('\n  ✗ 下载失败: ' + ((p.json && p.json.error) || p.body).slice(0, 200))
  }

  /* 3. 下载列表里能看到 */
  console.log('\n【3】下载列表')
  const dl = await req('GET', '/api/downloads')
  let files = []
  try { files = JSON.parse(dl.body).files || [] } catch (e) { }
  console.log('  文件数: ' + files.length)
  files.slice(0, 3).forEach((f) => console.log('    - ' + f.name + '  ' + (f.size / 1048576).toFixed(2) + ' MB'))
})()