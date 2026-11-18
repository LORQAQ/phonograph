'use strict'
/* 全量取流测试：三个推荐歌单的全部歌曲 + 三平台搜索结果，统计成功率 */
const BASE = 'http://127.0.0.1:37621'

async function j (url, opts) {
  const res = await fetch(BASE + url, opts)
  const t = await res.text()
  try { return JSON.parse(t) } catch (e) { return { error: t.slice(0, 100) } }
}

async function pool (tasks, limit = 4) {
  const out = []
  let i = 0
  const workers = Array.from({ length: limit }, async () => {
    while (i < tasks.length) {
      const idx = i++
      out[idx] = await tasks[idx]()
    }
  })
  await Promise.all(workers)
  return out
}

async function testList (label, songs) {
  const tasks = songs.map((s) => async () => {
    const qs = '/api/url?id=' + encodeURIComponent(s.id) +
      '&source=' + (s.source || 'wy') +
      '&quality=320k' +
      '&name=' + encodeURIComponent(s.name || '') +
      '&singer=' + encodeURIComponent(s.singer || '')
    const t0 = Date.now()
    try {
      const r = await j(qs)
      return { name: s.name, ok: !!r.url, provider: r.provider || '', ms: Date.now() - t0, err: r.error || '' }
    } catch (e) {
      return { name: s.name, ok: false, err: e.message, ms: Date.now() - t0 }
    }
  })
  const res = await pool(tasks, 4)
  const ok = res.filter((x) => x.ok).length
  const fails = res.filter((x) => !x.ok)
  const providers = {}
  res.filter((x) => x.ok).forEach((x) => {
    const key = (x.provider || '?').replace(/（.*?）/g, '')
    providers[key] = (providers[key] || 0) + 1
  })
  console.log('\n【' + label + '】 ' + ok + ' / ' + res.length + ' 成功' + (ok === res.length ? ' ✅' : ''))
  const pv = Object.entries(providers).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + '×' + v).join(', ')
  if (pv) console.log('  音源分布: ' + pv)
  if (fails.length) {
    console.log('  失败 ' + fails.length + ' 首:')
    fails.slice(0, 12).forEach((f) => console.log('    - ' + (f.name || '?').slice(0, 24) + ' → ' + (f.err || '').slice(0, 40)))
    if (fails.length > 12) console.log('    …还有 ' + (fails.length - 12) + ' 首')
  }
  return { ok, total: res.length, fails }
}

;(async () => {
  const disc = await j('/api/discover?source=wy&offset=0&limit=3')
  const pls = (disc.playlists || []).slice(0, 3)
  let totalOk = 0
  let totalAll = 0

  for (const p of pls) {
    const prev = await j('/api/playlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'preview', url: 'https://music.163.com/#/playlist?id=' + p.id }),
    })
    const songs = (prev.songs || []).slice(0, 40)
    if (!songs.length) { console.log('\n【' + p.name + '】取不到歌曲'); continue }
    const r = await testList(p.name.slice(0, 18), songs)
    totalOk += r.ok
    totalAll += r.total
  }

  /* 三平台搜索结果各 10 首 */
  for (const src of ['wy', 'tx', 'kg']) {
    const sr = await j('/api/search?kw=' + encodeURIComponent('周杰伦') + '&page=1&limit=10&source=' + src)
    const list = (sr.list || []).slice(0, 10)
    if (!list.length) continue
    const r = await testList('搜索·' + src + ' 周杰伦', list)
    totalOk += r.ok
    totalAll += r.total
  }

  console.log('\n' + '═'.repeat(60))
  console.log('总成功率: ' + totalOk + ' / ' + totalAll + '  (' + Math.round(totalOk / totalAll * 100) + '%)')
})()
