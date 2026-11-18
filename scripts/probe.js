'use strict'
/* 音源脚本可用性探测：node scripts/probe.js */
const fs = require('node:fs')
const path = require('node:path')
const { LxScript } = require('../app/lib/lx-engine.js')
const { gdRequest } = require('../app/lib/gdstudio.js')

const DIR = path.join(__dirname, '..', 'sources', 'raw')

async function main () {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.js'))
  // 拿一首真实歌曲做测试（网易云）
  const search = await gdRequest({ types: 'search', source: 'netease', name: '屋顶', count: 5, pages: 1 })
  const song = Array.isArray(search.body) ? search.body[0] : null
  console.log('测试歌曲:', song && song.name, song && song.artist, song && song.id)
  const wyInfo = song && {
    songmid: song.url_id || song.id,
    id: song.id,
    name: song.name,
    singer: (song.artist || []).join('、'),
    albumName: song.album,
    albumId: song.pic_id,
    source: 'wy',
    interval: '04:00',
    _types: {},
  }

  const results = []
  for (const f of files) {
    const code = fs.readFileSync(path.join(DIR, f), 'utf8')
    const s = new LxScript(code, f)
    const row = { file: f, name: s.meta.name, version: s.meta.version, ok: false, sources: [], url: '', err: '', logs: '' }
    try {
      const info = await s.init(20000)
      row.ok = true
      row.sources = Object.keys(info.sources || {})
      const support = row.sources
      row.qualitys = {}
      for (const src of support) row.qualitys[src] = (info.sources[src].qualitys || []).join('/')
      if (support.includes('wy') && wyInfo) {
        try {
          const url = await s.musicUrl('wy', wyInfo, '320k')
          row.url = typeof url === 'string' ? url : JSON.stringify(url)
        } catch (e) { row.err = 'url失败: ' + e.message }
      } else if (!support.length) row.err = '无源声明'
    } catch (e) {
      row.err = e.message
    }
    row.logs = s.logs.slice(-4).map((l) => l.level + ': ' + l.line).join(' | ')
    s.dispose()
    results.push(row)
    console.log(JSON.stringify(row, null, 0))
  }
  fs.writeFileSync(path.join(__dirname, '..', 'sources', 'probe-report.json'), JSON.stringify(results, null, 2))
}

main().catch((e) => { console.error('FATAL', e); process.exit(1) })
