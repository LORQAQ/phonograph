'use strict'
/* fish 有时成功有时失败（strict match 偶发不中），加两次重试提高成功率 */
const fs = require('node:fs')
const p = 'mobile/www/lib/lx-engine-web.js'
let s = fs.readFileSync(p, 'utf8')

const oldBlock = `      /* ① 先单独试 fish：实测只有它给完整版，其他音源返回 30 秒试听 */
      const fishScript = this.scripts.get('fish')
      if (fishScript) {
        try {
          const fr = await withTimeout(Promise.resolve(fishScript.musicUrl(platform, info, quality)), 10000)
          const fu = typeof fr === 'string' ? fr : (fr && (fr.url || (fr.data && fr.data.url)))
          if (fu && await probeUrl(fu)) {
            return { url: fu, provider: 'fish_music', quality: quality }
          }
        } catch (e) {
          console.warn('[取流] fish 失败', e && e.message)
        }
      }`

const newBlock = `      /* ① 先单独试 fish：实测只有它给完整版，其他音源返回 30 秒试听
           strict match 偶发不中，重试 3 次（带不同音质档） */
      const fishScript = this.scripts.get('fish')
      if (fishScript) {
        const qs = quality === 'flac' ? ['flac', '320k', '128k'] : ['320k', '128k', 'flac']
        for (let attempt = 0; attempt < 3; attempt++) {
          const q2 = qs[attempt] || quality
          try {
            const fr = await withTimeout(Promise.resolve(fishScript.musicUrl(platform, info, q2)), 9000)
            const fu = typeof fr === 'string' ? fr : (fr && (fr.url || (fr.data && fr.data.url)))
            if (fu && await probeUrl(fu)) {
              return { url: fu, provider: 'fish_music', quality: q2 }
            }
          } catch (e) {
            console.warn('[取流] fish 第' + (attempt + 1) + '次失败', e && e.message)
            await new Promise((r) => setTimeout(r, 300))
          }
        }
      }`

if (s.includes(oldBlock)) {
  s = s.replace(oldBlock, newBlock)
  fs.writeFileSync(p, s, 'utf8')
  console.log('fish 已加 3 次重试')
} else {
  console.log('未匹配')
}
