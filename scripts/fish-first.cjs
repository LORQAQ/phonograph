'use strict'
/* 关键：kxh 返回的是 30 秒试听版，并行竞速时它最快 → 总是它赢
   fish 才是唯一能给完整版的。改成：fish 先单独试，失败才并发其他 */
const fs = require('node:fs')
const p = 'mobile/www/lib/lx-engine-web.js'
let s = fs.readFileSync(p, 'utf8')

const anchor = `      /* 并行竞速：谁先给出可用 URL 就用谁 */`

if (!s.includes(anchor)) {
  console.log('未找到竞速代码块')
  process.exit(1)
}

const insert = `      /* ① 先单独试 fish：实测只有它给完整版，其他音源返回 30 秒试听 */
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
      }

      /* ② fish 不行，再并发试其他的 */

${anchor}`

s = s.replace(anchor, insert)
fs.writeFileSync(p, s, 'utf8')
console.log('resolve 已改为 fish 优先')
