'use strict'
/* 实测酷狗切歌延迟：逐环节计时，找瓶颈 */
const path = require('node:path')
const http = require('node:http')
process.chdir(path.resolve(__dirname, '..'))

const BASE = 'http://127.0.0.1:37621'

function get (p, timeout = 90000) {
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

;(async () => {
  const h = await get('/api/health', 10000)
  console.log('服务: ' + (h.status === 200 ? 'ok' : '未启动'))
  if (h.status !== 200) return

  console.log('\n=== 1. 酷狗榜单拉取（这个只是列表，不算切歌）===')
  const top = await get('/api/toplist?type=hot&source=kg')
  let list = []
  try { list = JSON.parse(top.body).list || [] } catch (e) { }
  console.log('  ' + top.ms + 'ms  ' + list.length + ' 首')

  if (!list.length) { console.log('  拿不到榜单，退出'); return }

  console.log('\n=== 2. 酷狗取流（逐首，含冷启动）===')
  const samples = list.slice(0, 3)
  for (const s of samples) {
    const qs = new URLSearchParams({ id: s.id, source: 'kg', quality: '320k', name: s.name, singer: s.singer || '' })
    const r = await get('/api/url?' + qs.toString())
    let j = null
    try { j = JSON.parse(r.body) } catch (e) { }
    const url = (j && j.url) || ''
    const prov = (j && j.provider) || ''
    const cross = (j && j.crossPlatform) || ''
    console.log('  ' + String(s.name || '').slice(0, 16).padEnd(18) +
      String(r.ms).padStart(6) + 'ms  ' +
      (url ? '✓' : '✗') + '  ' + prov + (cross ? '  [跨平台]' : ''))
  }

  console.log('\n=== 3. 同一首第二次（应该命中缓存）===')
  const s0 = samples[0]
  const qs2 = new URLSearchParams({ id: s0.id, source: 'kg', quality: '320k' })
  const r2 = await get('/api/url?' + qs2.toString())
  console.log('  ' + r2.ms + 'ms  ' + (r2.ms < 500 ? '✓ 缓存生效' : '⚠ 没命中缓存'))

  console.log('\n=== 4. /api/stream 首字节延迟 ===')
  const streamT0 = Date.now()
  await new Promise((resolve) => {
    const q = http.get(BASE + '/api/stream?id=' + encodeURIComponent(s0.id) + '&source=kg&quality=320k', { timeout: 60000 }, (res) => {
      let got = 0
      res.on('data', (c) => {
        got += c.length
        if (got >= 65536) {
          console.log('  首 64KB: ' + (Date.now() - streamT0) + 'ms  status=' + res.statusCode + ' ct=' + (res.headers['content-type'] || ''))
          res.destroy()
          resolve()
        }
      })
      res.on('end', () => { console.log('  结束: ' + (Date.now() - streamT0) + 'ms total=' + got); resolve() })
      res.on('error', () => resolve())
    })
    q.on('error', () => resolve())
    q.on('timeout', () => { q.destroy(); resolve() })
  })

  console.log('\n=== 5. 音源加载状态 ===')
  const src = await get('/api/sources', 20000)
  try {
    const j = JSON.parse(src.body)
    const list2 = j.list || []
    console.log('  ' + list2.length + ' 个音源')
    for (const x of list2) {
      console.log('    ' + String(x.id).padEnd(12) + (x.status === 'ok' ? '✓' : '✗') +
        '  优先级 ' + x.priority + '  支持 kg:' + (x.sources && x.sources.kg ? '是' : '否'))
    }
  } catch (e) { console.log('  解析失败') }
})()
