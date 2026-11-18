'use strict'
/* 跨平台兜底并行化：kg 与 tx 同时搜，谁先成功用谁 */
const fs = require('node:fs')

let s = fs.readFileSync('mobile/www/api-mobile.js', 'utf8')
const marker = "        const kw = ((mi.name || '') + ' ' + (mi.singer || '')).trim()"

if (s.includes(marker) && !s.includes('__crossParallel')) {
  /* 找到整段 for 循环并替换为并行版 */
  const start = s.indexOf('if (kw && window.LxScriptManager) {')
  if (start > 0) {
    const endMark = '        throw e'
    const end = s.indexOf(endMark, start)
    if (end > 0) {
      const block = `if (kw && window.LxScriptManager) {
          const __crossParallel = async (plat) => {
            try {
              const lib = plat === 'tx' ? NET_TX : NET_KG
              const sr = await lib.search(kw, 1, 2)
              for (const s2 of (sr.list || []).slice(0, 2)) {
                const alt = Object.assign({}, mi, {
                  musicId: s2.id, id: s2.id, songmid: s2.id, hash: s2.id,
                  source: plat, name: s2.name || mi.name, singer: s2.singer || mi.singer,
                  albumName: s2.album || mi.albumName,
                })
                const hit = await window.LxScriptManager.resolve(plat, alt, quality)
                if (hit && hit.url) {
                  return {
                    id, source, url: hit.url, quality: hit.quality || quality,
                    provider: (hit.provider || plat) + '（跨平台·' + plat + '）', via: 'cross',
                  }
                }
              }
            } catch (e2) { }
            return null
          }
          const plats = ['kg', 'tx'].filter((x) => x !== source)
          const found = await Promise.race([
            __crossParallel(plats[0]).then((v) => v || new Promise(() => {})),
            __crossParallel(plats[1] || 'tx'),
          ].concat([new Promise((res) => setTimeout(() => res(null), 9000))]))
          if (found) return found
        }
`
      s = s.slice(0, start) + block + s.slice(end)
      fs.writeFileSync('mobile/www/api-mobile.js', s, 'utf8')
      console.log('跨平台并行已应用')
    }
  }
} else {
  console.log('跳过（已应用或未找到）')
}
