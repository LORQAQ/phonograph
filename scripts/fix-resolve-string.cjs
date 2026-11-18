'use strict'
/* 根因：有的音源 musicUrl 直接返回 URL 字符串，有的是 {url:"..."}
   统一兼容这两种返回格式 */
const fs = require('node:fs')
const p = 'mobile/www/lib/lx-engine-web.js'
let s = fs.readFileSync(p, 'utf8')

const oldPart = `      const tasks = list.map(async (s2) => {
        try {
          const r = await withTimeout(Promise.resolve(s2.musicUrl(platform, info, quality)), 9000)
          if (!r || !r.url) return null
          const ok = await probeUrl(r.url)
          if (!ok) {
            console.warn('[取流] URL 不可用，跳过', s2.id, r.url.slice(0, 50))
            return null
          }
          return Object.assign({}, r, { provider: r.provider || s2.id })
        } catch (e) {
          return null
        }
      })`

const newPart = `      const tasks = list.map(async (s2) => {
        try {
          const r = await withTimeout(Promise.resolve(s2.musicUrl(platform, info, quality)), 9000)
          /* 兼容：字符串 URL 或 { url: '...' } 或 { data: { url } } */
          let u = ''
          let extra = {}
          if (typeof r === 'string') {
            u = r
          } else if (r && typeof r === 'object') {
            u = r.url || (r.data && r.data.url) || ''
            extra = r
          }
          if (!u) return null
          const ok = await probeUrl(u)
          if (!ok) {
            console.warn('[取流] URL 无效，跳过', s2.id, String(u).slice(0, 50))
            return null
          }
          return Object.assign({}, extra, { url: u, provider: extra.provider || s2.id })
        } catch (e) {
          return null
        }
      })`

if (s.includes(oldPart)) {
  s = s.replace(oldPart, newPart)
  fs.writeFileSync(p, s, 'utf8')
  console.log('resolve 已兼容字符串返回')
} else {
  console.log('未匹配 tasks 块')
}
