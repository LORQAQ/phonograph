'use strict'
/* 智能排序：按「历史成功率 + 速度 + 最近失败」给每个源打分，不再固定顺序 */
const fs = require('node:fs')
const p = 'app/lib/source-manager.js'
let s = fs.readFileSync(p, 'utf8')

/* 1) 构造函数里加 stats */
if (!s.includes('this.stats = new Map()')) {
  s = s.replace(
    'this.entries = new Map()',
    'this.entries = new Map()\n    this.stats = new Map() // "源|平台" -> { ok, fail, avgMs, lastFail }'
  )
}

/* 2) 加统计方法（放在 candidates 前） */
if (!s.includes('recordResult (')) {
  s = s.replace(
    '  candidates (platform) {',
    `  /** 记录一次取流结果，用于后续排序 */
  recordResult (sourceId, platform, ok, ms) {
    const k = sourceId + '|' + platform
    let st = this.stats.get(k)
    if (!st) { st = { ok: 0, fail: 0, avgMs: 0, lastFail: 0 }; this.stats.set(k, st) }
    if (ok) {
      st.ok++
      st.avgMs = st.avgMs ? Math.round(st.avgMs * 0.7 + (ms || 0) * 0.3) : (ms || 0)
    } else {
      st.fail++
      st.lastFail = Date.now()
    }
  }

  /** 打分：成功率为主，速度加分，近期失败扣分 */
  scoreOf (sourceId, platform) {
    const st = this.stats.get(sourceId + '|' + platform)
    if (!st || (st.ok + st.fail) < 2) return 50
    const total = st.ok + st.fail
    const rate = st.ok / total
    const speed = st.avgMs > 0 ? Math.max(-15, 12 - st.avgMs / 800) : 0
    const recentFail = (st.lastFail && (Date.now() - st.lastFail < 600000)) ? -35 : 0
    return rate * 100 + speed + recentFail
  }

  candidates (platform) {`
  )
}

/* 3) candidates 排序改成按分数（kg 专用顺序保留作为初始参考） */
const oldSort = `    if (platform === 'kg') {
      const KG_ORDER = ['fish', 'kulao', 'quandouyao', 'yiyin', 'lxv7', 'lx', 'huibq', 'nianxin', 'changqing', 'feichangdao', 'grass', 'flower', 'ikun', 'sixyin', 'juhe']
      list.sort((a, b) => {
        const ia = KG_ORDER.indexOf(a.id)
        const ib = KG_ORDER.indexOf(b.id)
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
      })
    }
    return list`

const newSort = `    const KG_ORDER = ['fish', 'kulao', 'quandouyao', 'yiyin', 'lxv7', 'lx', 'huibq', 'nianxin', 'changqing', 'feichangdao', 'grass', 'flower', 'ikun', 'sixyin', 'juhe']
    const initialBias = (id) => {
      const i = KG_ORDER.indexOf(id)
      return platform === 'kg' ? (i < 0 ? 9 : i) * -0.5 : 0
    }
    list.sort((a, b) => {
      const sa = this.scoreOf(a.id, platform) + initialBias(a.id)
      const sb = this.scoreOf(b.id, platform) + initialBias(b.id)
      return sb - sa
    })
    return list`

if (s.includes(oldSort)) {
  s = s.replace(oldSort, newSort)
} else {
  /* 兼容：直接把最后的 return list 前面插入智能排序 */
  s = s.replace(
    `    return list
  }`,
    `    const KG_ORDER = ['fish', 'kulao', 'quandouyao', 'yiyin', 'lxv7', 'lx', 'huibq', 'nianxin', 'changqing', 'feichangdao', 'grass', 'flower', 'ikun', 'sixyin', 'juhe']
    const initialBias = (id) => {
      const i = KG_ORDER.indexOf(id)
      return platform === 'kg' ? (i < 0 ? 9 : i) * -0.5 : 0
    }
    list.sort((a, b) => (this.scoreOf(b.id, platform) + initialBias(b.id)) - (this.scoreOf(a.id, platform) + initialBias(a.id)))
    return list
  }`
  )
}

/* 4) 取流成功/失败时记录 */
s = s.replace(
  `            const alive = await probeUrl(url, 6000)
            if (alive) {
              attempts.push({ id: c.id, name: entry.meta.name, quality: q, ok: true, ms })`,
  `            const alive = await probeUrl(url, 6000)
            if (alive) {
              this.recordResult(c.id, platform, true, ms)
              attempts.push({ id: c.id, name: entry.meta.name, quality: q, ok: true, ms })`
)
s = s.replace(
  `            attempts.push({ id: c.id, name: entry.meta.name, quality: q, ok: false, ms, error: '地址不可用' })`,
  `            this.recordResult(c.id, platform, false, ms)
            attempts.push({ id: c.id, name: entry.meta.name, quality: q, ok: false, ms, error: '地址不可用' })`
)
s = s.replace(
  `          attempts.push({ id: c.id, name: entry.meta.name, quality: q, ok: false, ms: Date.now() - t0, error: (e && e.message) || '错误' })`,
  `          this.recordResult(c.id, platform, false, Date.now() - t0)
          attempts.push({ id: c.id, name: entry.meta.name, quality: q, ok: false, ms: Date.now() - t0, error: (e && e.message) || '错误' })`
)

fs.writeFileSync(p, s, 'utf8')
console.log('stats:', s.includes('this.stats = new Map()'))
console.log('recordResult:', s.includes('recordResult (sourceId'))
console.log('智能排序:', s.includes('this.scoreOf(a.id, platform)'))
console.log('记录结果:', (s.match(/this\.recordResult\(/g) || []).length, '处')
