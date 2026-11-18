'use strict'
/* 电脑端 resolveUrl 改并行抢答：所有可用源同时发起，第一个成功立即返回（每个 5s 上限） */
const fs = require('node:fs')
const p = 'app/lib/source-manager.js'
let s = fs.readFileSync(p, 'utf8')

const start = s.indexOf('  async resolveUrl (platform, musicInfo, wantedQuality, only) {')
if (start < 0) { console.log('未找到 resolveUrl'); process.exit(1) }
const end = s.indexOf('\n  async testAll', start)
if (end < 0) { console.log('未找到 testAll'); process.exit(1) }

const impl = `  async resolveUrl (platform, musicInfo, wantedQuality, only) {
    let cands = this.candidates(platform)
    if (only) cands = cands.filter((c) => c.id === only)
    if (!cands.length) throw new Error(only ? ('指定音源不可用：' + only) : ('没有可用的音源脚本支持 ' + platform))

    const attempts = []
    const QUALITY_ORDER = ['flac24bit', 'flac', '320k', '192k', '128k']

    /* 每个源只试"首选 + 降级一档"，并行发起，谁先成功用谁 */
    const task = (c) => async () => {
      const entry = this.entries.get(c.id)
      if (!entry || !entry.script) throw new Error('脚本未就绪')
      const qs = (entry.qualitys[platform] || '').split('/').filter(Boolean)
      const tries = []
      if (wantedQuality && qs.includes(wantedQuality)) tries.push(wantedQuality)
      for (const q of QUALITY_ORDER) if (qs.includes(q) && !tries.includes(q)) tries.push(q)
      if (!tries.length) tries.push(wantedQuality || '320k')
      for (const q of tries.slice(0, 2)) {
        const t0 = Date.now()
        try {
          const url = await callWithTimeout(() => entry.script.musicUrl(platform, musicInfo, q), 5000)
          const ms = Date.now() - t0
          if (typeof url === 'string' && /^https?:\\/\\//.test(url)) {
            attempts.push({ id: c.id, name: entry.meta.name, quality: q, ok: true, ms })
            return { url, quality: q, provider: entry.meta.name, sourceId: c.id, attempts }
          }
          attempts.push({ id: c.id, name: entry.meta.name, quality: q, ok: false, ms, error: '返回空地址' })
        } catch (e) {
          attempts.push({ id: c.id, name: entry.meta.name, quality: q, ok: false, ms: Date.now() - t0, error: (e && e.message) || '错误' })
        }
      }
      throw new Error('no url')
    }

    const winner = await new Promise((resolve) => {
      let settled = false
      let pending = cands.length
      const timer = setTimeout(() => { if (!settled) { settled = true; resolve(null) } }, 9000)
      cands.forEach((c) => {
        task(c)().then((v) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          resolve(v)
        }).catch(() => {
          if (--pending === 0 && !settled) { settled = true; clearTimeout(timer); resolve(null) }
        })
      })
    })

    if (winner) return winner
    const last = attempts.filter((a) => !a.ok).slice(-1)[0]
    throw new Error('所有音源均失败' + (last ? '（最后错误：' + last.name + ': ' + last.error + '）' : ''))
  },

`
s = s.slice(0, start) + impl + s.slice(end)
fs.writeFileSync(p, s, 'utf8')
console.log('并行抢答已应用:', s.includes('const winner = await new Promise'))
