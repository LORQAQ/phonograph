'use strict'
/* resolve 提速：音质并行尝试，不再串行等待 */
const fs = require('node:fs')
const p = 'mobile/www/lib/lx-engine-web.js'
let s = fs.readFileSync(p, 'utf8')

const oldBlock = `        /* 该歌曲没有所选音质时自动降级，不让整首播放失败 */
        const wanted = quality || '320k'
        const tries = [wanted].concat(QORDER.filter((q) => q !== wanted)).slice(0, 3)
        for (const q of tries) {
          try {
            const url = await s.musicUrl(platform, info, q)
            if (url) {
              cands.push({ url: String(url), quality: q, provider: s.meta.name || id, script: id })
              break
            }
          } catch (e) {
            /* 换下一个音质 */
          }
        }`

const newBlock = `        /* 音质并行尝试：谁先成功用谁，避免串行等待 */
        const wanted = quality || '320k'
        const tries = [wanted].concat(QORDER.filter((q) => q !== wanted)).slice(0, 3)
        try {
          const results = await Promise.all(tries.map((q) =>
            s.musicUrl(platform, info, q).then((u) => (u ? { url: String(u), quality: q } : null)).catch(() => null)
          ))
          const hit = results.find(Boolean)
          if (hit) {
            cands.push({ url: hit.url, quality: hit.quality, provider: s.meta.name || id, script: id })
          }
        } catch (e) { }`

if (s.includes(oldBlock)) {
  s = s.replace(oldBlock, newBlock)
  fs.writeFileSync(p, s, 'utf8')
  console.log('音质并行已应用')
} else if (s.includes('const results = await Promise.all(tries.map')) {
  console.log('已是并行版')
} else {
  console.log('未匹配，当前片段：')
  const i = s.indexOf('const tries =')
  console.log(s.slice(Math.max(0, i - 120), i + 380))
}

/* 探活只对前 2 个候选做（减少等待） */
s = fs.readFileSync(p, 'utf8')
s = s.replace('for (const c of cands) {\n        try {\n          if (window.NativeHttp && window.NativeHttp.probe)',
  'for (const c of cands.slice(0, 2)) {\n        try {\n          if (window.NativeHttp && window.NativeHttp.probe)')
fs.writeFileSync(p, s, 'utf8')
console.log('探活限制前2:', s.includes('cands.slice(0, 2)'))
