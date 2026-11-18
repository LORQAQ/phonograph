'use strict'
/* 回退：并行反而更慢，改回串行（kg → tx），音质串行 */
const fs = require('node:fs')

/* ---------- 1) 音质串行 ---------- */
let eng = fs.readFileSync('mobile/www/lib/lx-engine-web.js', 'utf8')
const pStart = eng.indexOf('        try {\n          const results = await Promise.all(tries.map')
if (pStart > 0) {
  const pEnd = eng.indexOf('        } catch (e) { }', pStart)
  if (pEnd > 0) {
    const seq = `        for (const q of tries) {
          try {
            const url = await s.musicUrl(platform, info, q)
            if (url) {
              cands.push({ url: String(url), quality: q, provider: s.meta.name || id, script: id })
              break
            }
          } catch (e) { }
        }
`
    eng = eng.slice(0, pStart) + seq + eng.slice(pEnd + '        } catch (e) { }'.length)
    fs.writeFileSync('mobile/www/lib/lx-engine-web.js', eng, 'utf8')
    console.log('音质已改回串行')
  }
} else {
  console.log('音质已是串行或未匹配')
}

/* ---------- 2) 跨平台串行 ---------- */
let mob = fs.readFileSync('mobile/www/api-mobile.js', 'utf8')
const cStart = mob.indexOf('if (kw && window.LxScriptManager) {')
if (cStart > 0 && mob.includes('__crossParallel')) {
  const cEnd = mob.indexOf('        throw e', cStart)
  if (cEnd > 0) {
    const seq = `if (kw && window.LxScriptManager) {
          for (const plat of ['kg', 'tx']) {
            if (plat === source) continue
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
          }
        }
`
    mob = mob.slice(0, cStart) + seq + mob.slice(cEnd)
    fs.writeFileSync('mobile/www/api-mobile.js', mob, 'utf8')
    console.log('跨平台已改回串行（kg 优先）')
  }
} else {
  console.log('跨平台已是串行或未匹配')
}
