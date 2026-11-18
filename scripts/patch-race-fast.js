'use strict'
/* 用"第一个成功即返回"的抢答模式，不等慢源 */
const fs = require('node:fs')
const p = 'mobile/www/lib/lx-engine-web.js'
let s = fs.readFileSync(p, 'utf8')

const old = `      /* 前 6 个脚本各试首选音质，谁先给出地址就用谁（不做探活，最快） */
      const batch = ordered.slice(0, 6)
      const results = await Promise.allSettled(batch.map(async ([id, s2]) => {
        const q = s2.sources && s2.sources[platform] ? wanted : wanted
        const url = await s2.musicUrl(platform, info, q)
        if (!url) throw new Error('empty')
        return { url: String(url), quality: q, provider: s2.meta.name || id, script: id }
      }))
      const hit = results.find((r) => r.status === 'fulfilled')
      if (hit) return hit.value`

const neu = `      /* 抢答：谁先返回有效地址就用谁，不等慢源 */
      const batch = ordered.slice(0, 6)
      const hit = await new Promise((resolve) => {
        let settled = false
        let pending = batch.length
        const timer = setTimeout(() => { if (!settled) { settled = true; resolve(null) } }, 8000)
        batch.forEach(([id, s2]) => {
          Promise.resolve()
            .then(() => s2.musicUrl(platform, info, wanted))
            .then((u) => {
              if (!u || settled) return
              settled = true
              clearTimeout(timer)
              resolve({ url: String(u), quality: wanted, provider: s2.meta.name || id, script: id })
            })
            .catch(() => {})
            .finally(() => { if (--pending === 0 && !settled) { settled = true; clearTimeout(timer); resolve(null) } })
        })
      })
      if (hit) return hit`

if (s.includes(old)) {
  s = s.replace(old, neu)
  fs.writeFileSync(p, s, 'utf8')
  console.log('已改为抢答模式')
} else {
  console.log('未匹配，当前片段：')
  const i = s.indexOf('前 6 个脚本')
  console.log(s.slice(Math.max(0, i - 60), i + 460))
}
