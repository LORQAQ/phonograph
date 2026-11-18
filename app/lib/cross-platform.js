'use strict'
/**
 * 跨平台兜底（自包含）：当前平台取流失败时，用歌名+歌手去其他平台找同款
 * 依赖由调用方注入，避免和 server.js 内部状态耦合
 */
module.exports = async function resolveWithCross (ctx) {
  const {
    platform, info, quality, only,
    sourceManager, buildMusicInfo,
    libs,                     // { qq, kugou }
    order = ['kg', 'tx'],
  } = ctx

  try {
    const r = await sourceManager.resolveUrl(platform, info, quality, only)
    if (r && r.url) return { result: r, crossFrom: '' }
  } catch (e) {
    ctx.lastError = e
  }

  const kw = ((info.name || '') + ' ' + (info.singer || '')).trim()
  if (!kw) {
    if (ctx.lastError) throw ctx.lastError
    throw new Error('没有可用音源')
  }

  for (const plat of order) {
    if (plat === platform) continue
    const lib = plat === 'tx' ? libs.qq : libs.kugou
    if (!lib) continue
    try {
      const sr = await lib.search(kw, 1, 2)
      for (const s2 of (sr.list || []).slice(0, 2)) {
        try {
          const alt = await buildMusicInfo(plat, s2.id, { name: s2.name, singer: s2.singer, album: s2.album })
          const r2 = await sourceManager.resolveUrl(plat, alt, quality, only)
          if (r2 && r2.url) {
            return {
              result: Object.assign({}, r2, {
                provider: (r2.provider || plat) + '（跨平台·' + plat + '）',
                crossPlatform: plat,
              }),
              crossFrom: plat,
            }
          }
        } catch (e2) { /* 换下一个候选 */ }
      }
    } catch (e3) { /* 换下一个平台 */ }
  }

  if (ctx.lastError) throw ctx.lastError
  throw new Error('所有音源均失败')
}
