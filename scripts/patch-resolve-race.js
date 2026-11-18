'use strict'
/* resolve 改为"前 3 个脚本并行抢"，谁先通过探活用谁 —— 首播从 10s 降到 1-2s */
const fs = require('node:fs')
const p = 'mobile/www/lib/lx-engine-web.js'
let s = fs.readFileSync(p, 'utf8')

const start = s.indexOf('    async resolve (platform, info, quality, only) {')
if (start < 0) { console.log('未找到 resolve'); process.exit(1) }
const end = s.indexOf('\n    },', start)
if (end < 0) { console.log('未找到结束'); process.exit(1) }

const impl = `    async resolve (platform, info, quality, only) {
      if (!this.scripts.size) return null
      const PRIO = ['fish', 'nianxin', 'kulao', 'quandouyao', 'yiyin', 'lxv7', 'lx', 'huibq', 'ikun', 'flower', 'grass', 'changqing', 'juhe', 'sixyin']
      let pool = Array.from(this.scripts.entries())
        .filter(([id, s]) => !this.disabled.has(id) && (!only || id === only) && s.sources && s.sources[platform])
        .sort((a, b) => {
          const ia = PRIO.indexOf(a[0]); const ib = PRIO.indexOf(b[0])
          return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
        })

      if (!pool.length) return null

      const wanted = quality || '320k'
      const QORDER = ['flac24bit', 'flac', '320k', '192k', '128k']
      const tries = [wanted].concat(QORDER.filter((q) => q !== wanted)).slice(0, 3)

      const attempt = async ([id, s]) => {
        for (const q of tries) {
          let url = null
          try { url = await s.musicUrl(platform, info, q) } catch (e) { continue }
          if (!url) continue
          url = String(url)
          if (window.NativeHttp && window.NativeHttp.probe) {
            let ok = false
            try { ok = await window.NativeHttp.probe(url) } catch (e) { ok = false }
            if (!ok) continue
          }
          return { url, quality: q, provider: s.meta.name || id, script: id }
        }
        throw new Error('no url')
      }

      /* 先并发抢前 3 个，全部失败再扩到剩余脚本 */
      const batches = [pool.slice(0, 3), pool.slice(3, 7), pool.slice(7)]
      for (const batch of batches) {
        if (!batch.length) continue
        const results = await Promise.allSettled(batch.map((item) => attempt(item)))
        const ok = results.find((r) => r.status === 'fulfilled')
        if (ok) return ok.value
      }
      return null
    },`

s = s.slice(0, start) + impl + s.slice(end + '\n    },'.length)
fs.writeFileSync(p, s, 'utf8')
console.log('resolve 已改为分批并发:', s.includes('分批'))
