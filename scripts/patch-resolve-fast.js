'use strict'
/* 最终版 resolve：快字优先。只试前 3 个脚本 × 首选音质，不在这里做探活
   （探活交给播放器 onAudioError 换源重试，避免首播被拖到十几秒） */
const fs = require('node:fs')
const p = 'mobile/www/lib/lx-engine-web.js'
let s = fs.readFileSync(p, 'utf8')

const start = s.indexOf('    async resolve (platform, info, quality, only) {')
if (start < 0) { console.log('未找到'); process.exit(1) }
const end = s.indexOf('\n    },', start)

const impl = `    async resolve (platform, info, quality, only) {
      if (!this.scripts.size) return null
      const PRIO = ['fish', 'nianxin', 'kulao', 'quandouyao', 'yiyin', 'lxv7', 'lx', 'huibq', 'ikun', 'flower', 'grass', 'changqing', 'juhe', 'sixyin']
      const ordered = Array.from(this.scripts.entries())
        .filter(([id, s2]) => !this.disabled.has(id) && (!only || id === only) && s2.sources && s2.sources[platform])
        .sort((a, b) => {
          const ia = PRIO.indexOf(a[0]); const ib = PRIO.indexOf(b[0])
          return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
        })
      if (!ordered.length) return null

      const wanted = quality || '320k'
      const QORDER = ['320k', 'flac', '128k']

      /* 前 6 个脚本各试首选音质，谁先给出地址就用谁（不做探活，最快） */
      const batch = ordered.slice(0, 6)
      const results = await Promise.allSettled(batch.map(async ([id, s2]) => {
        const q = s2.sources && s2.sources[platform] ? wanted : wanted
        const url = await s2.musicUrl(platform, info, q)
        if (!url) throw new Error('empty')
        return { url: String(url), quality: q, provider: s2.meta.name || id, script: id }
      }))
      const hit = results.find((r) => r.status === 'fulfilled')
      if (hit) return hit.value

      /* 全部失败再按降级音质试前 3 个 */
      for (const q of QORDER.slice(1)) {
        for (const [id, s2] of ordered.slice(0, 3)) {
          try {
            const url = await s2.musicUrl(platform, info, q)
            if (url) return { url: String(url), quality: q, provider: s2.meta.name || id, script: id }
          } catch (e) { }
        }
      }
      return null
    },`

s = s.slice(0, start) + impl + s.slice(end + '\n    },'.length)
fs.writeFileSync(p, s, 'utf8')
console.log('resolve 已简化为快字优先版')
