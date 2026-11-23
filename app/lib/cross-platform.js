'use strict'
/**
 * 跨平台兜底（自包含）：当前平台取流失败时，用歌名+歌手去其他平台找同款
 * 依赖由调用方注入，避免和 server.js 内部状态耦合
 *
 * BUG-REPORT-2 B4: 原来搜索后不校验名称相似度，直接返回第一个能取到 URL 的结果，
 * 导致「假 id + 空歌名」也能返回一首完全不相干的歌。现在必须通过相似度校验。
 */

/* 归一化：去空格、标点、括号、大小写 */
function norm (s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[\s\-_()（）\[\]【】.,!?~·'"`、：:；;《》「」]/g, '')
}

/* 简易 Levenshtein */
function editDist (a, b) {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = new Array(b.length + 1)
  let cur = new Array(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
    }
    const t = prev; prev = cur; cur = t
  }
  return prev[b.length]
}

/** "4:55" / "295" / 295000 → 秒。解析不出来返回 0 */
function parseDur (v) {
  if (typeof v === 'number' && isFinite(v)) return v > 10000 ? v / 1000 : v
  const t = String(v == null ? '' : v).trim()
  if (!t) return 0
  const m = t.match(/^(\d{1,3}):(\d{1,2})$/)
  if (m) return Number(m[1]) * 60 + Number(m[2])
  const n = Number(t)
  return isFinite(n) && n > 0 ? (n > 10000 ? n / 1000 : n) : 0
}

/* 两首歌名是否可能是同一首 */
function similarName (a, b) {
  const x = norm(a)
  const y = norm(b)
  if (!x || !y) return false
  if (x === y) return true
  /* 一方包含另一方（处理「歌名 (Live)」这类后缀差异） */
  if (x.length >= 2 && y.length >= 2 && (x.includes(y) || y.includes(x))) return true
  const d = editDist(x, y)
  const limit = Math.max(2, Math.floor(Math.max(x.length, y.length) * 0.3))
  return d <= limit
}

/* 歌手是否沾边（任一歌手名互相包含即可，不做严格比对） */
function similarSinger (a, b) {
  const x = norm(a)
  const y = norm(b)
  if (!x || !y) return true /* 有一边没歌手信息时放宽 */
  if (x.includes(y) || y.includes(x)) return true
  /* 多歌手时逐个比对 */
  const xs = String(a || '').split(/[/、,&]/).map(norm).filter(Boolean)
  const ys = String(b || '').split(/[/、,&]/).map(norm).filter(Boolean)
  for (const p of xs) {
    for (const q of ys) {
      if (p && q && (p.includes(q) || q.includes(p))) return true
      if (p && q && editDist(p, q) <= Math.max(1, Math.floor(Math.min(p.length, q.length) * 0.35))) return true
    }
  }
  return false
}

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

  /* B4: 元数据缺失时不做跨平台，否则会拿「未知歌曲 未知歌手」去搜 */
  const origName = String(info.name || '').trim()
  if (!origName || origName === '未知歌曲' || info._metaMissing) {
    if (ctx.lastError) throw ctx.lastError
    throw new Error('歌曲信息缺失，无法跨平台兜底' + (info._error ? '：' + info._error : ''))
  }

  const kw = (origName + ' ' + (info.singer || '')).trim()

  for (const plat of order) {
    if (plat === platform) continue
    const lib = plat === 'tx' ? libs.qq : libs.kugou
    if (!lib) continue
    try {
      const sr = await lib.search(kw, 1, 5)
      for (const s2 of (sr.list || []).slice(0, 5)) {
        /* B4: 必须先确认是同一首歌，再取流 */
        if (!similarName(s2.name, origName)) continue
        if (!similarSinger(s2.singer, info.singer)) continue
        /* 时长对不上的候选不再直接跳过 —— 那会导致「本来有个试听片段可放，
           被我挡成完全放不了」。片段识别交给 resolveUrl 里的音频时长校验：
           完整版优先，只有片段时以 clip:true 返回，前端标「仅试听」。 */
        const origSec = parseDur(info && info.interval)
        const candSec = Number(s2.duration) > 0 ? Number(s2.duration) / 1000 : parseDur(s2.durationText)
        const durMismatch = origSec > 0 && candSec > 0 && Math.abs(candSec - origSec) > Math.max(20, origSec * 0.4)
        try {
          /* interval 用**原曲**的时长，不是候选的 ——
             片段校验要靠它。用候选自己的时长，那「48 秒的片段自称 48 秒」就会混过去。 */
          const alt = await buildMusicInfo(plat, s2.id, {
            name: s2.name,
            singer: s2.singer,
            album: s2.album,
            interval: (info && info.interval) || s2.durationText || '',
          })
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

module.exports.similarName = similarName
module.exports.similarSinger = similarSinger
