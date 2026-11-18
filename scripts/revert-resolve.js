'use strict'
/* 回退 resolve 到稳定串行版（并发抢源在弱网/多失效源下反而更慢） */
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

      const start = Date.now()
      const wanted = quality || '320k'
      const QORDER = ['flac24bit', 'flac', '320k', '192k', '128k']
      const tries = [wanted].concat(QORDER.filter((q) => q !== wanted)).slice(0, 2)

      for (const [id, s2] of ordered) {
        if (Date.now() - start > 20000) break
        for (const q of tries) {
          let url = null
          try { url = await s2.musicUrl(platform, info, q) } catch (e) { continue }
          if (!url) continue
          url = String(url)
          if (window.NativeHttp && window.NativeHttp.probe) {
            let ok = false
            try { ok = await window.NativeHttp.probe(url) } catch (e) { ok = false }
            if (!ok) continue
          }
          return { url, quality: q, provider: s2.meta.name || id, script: id }
        }
      }
      return null
    },`

s = s.slice(0, start) + impl + s.slice(end + '\n    },'.length)
fs.writeFileSync(p, s, 'utf8')
console.log('已回退为串行稳定版')
