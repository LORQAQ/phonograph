'use strict'
/* 批量取流测试：拿推荐歌单前 N 首，逐首解析播放地址，统计成功率与失败原因 */
const BASE = 'http://127.0.0.1:37621'

async function j (url, opts) {
  const res = await fetch(BASE + url, opts)
  const text = await res.text()
  try { return JSON.parse(text) } catch (e) { return { error: 'parse: ' + text.slice(0, 80) } }
}

;(async () => {
  const disc = await j('/api/discover?source=wy&offset=0&limit=3')
  const pls = disc.playlists || []
  console.log('推荐歌单:', pls.map((p) => p.name.slice(0, 16)).join(' | '))

  const target = pls[0]
  if (!target) { console.log('没有推荐歌单'); return }
  const url = 'https://music.163.com/#/playlist?id=' + target.id
  console.log('\n测试歌单:', target.name, '(' + url + ')')

  const prev = await j('/api/playlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'preview', url }),
  })
  const songs = (prev.songs || []).slice(0, 20)
  console.log('取前', songs.length, '首测试\n')

  let ok = 0
  const fails = []
  for (let i = 0; i < songs.length; i++) {
    const s = songs[i]
    const qs = '/api/url?id=' + encodeURIComponent(s.id) + '&source=' + (s.source || 'wy') + '&quality=320k'
    const t0 = Date.now()
    const r = await j(qs)
    const ms = Date.now() - t0
    if (r.url) {
      ok++
      console.log(`✓ ${String(i + 1).padStart(2)}. ${s.name.slice(0, 22).padEnd(24)} ${r.provider || ''} ${r.quality || ''} ${ms}ms`)
    } else {
      fails.push({ name: s.name, err: r.error || r.message || JSON.stringify(r).slice(0, 80) })
      console.log(`✗ ${String(i + 1).padStart(2)}. ${s.name.slice(0, 22).padEnd(24)} ${(r.error || '').slice(0, 40)} ${ms}ms`)
    }
  }
  console.log('\n结果: ' + ok + '/' + songs.length + ' 成功')
  if (fails.length) {
    console.log('失败明细:')
    fails.forEach((f) => console.log('  - ' + f.name + ' → ' + f.err))
  }
})()
