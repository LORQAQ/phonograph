'use strict'
/* 第 3 批可靠性修复（服务端）：B16 / B17 / B18 / B41 / B42 / B47 */
const fs = require('node:fs')
const done = []
const miss = []

/* ============ B16: cached() 不缓存失败 ============ */
for (const file of ['app/lib/qq.js', 'app/lib/kugou.js']) {
  let s = fs.readFileSync(file, 'utf8')
  const old = `  const p = fn()
  cache.set(key, { value: p, exp: Date.now() + ttl })`
  if (s.includes(old)) {
    s = s.replace(old, `  const p = Promise.resolve().then(fn)
  cache.set(key, { value: p, exp: Date.now() + ttl })
  /* B16: 失败（rejected）立即清掉，别让一次抖动锁死 5~30 分钟 */
  p.catch(() => { const cur = cache.get(key); if (cur && cur.value === p) cache.delete(key) })`)
    fs.writeFileSync(file, s, 'utf8')
    done.push('B16 ' + file + ' 失败不缓存')
  } else {
    /* 找真实形态 */
    const idx = s.indexOf('function cached')
    if (idx > 0) {
      const seg = s.slice(idx, idx + 500)
      const m = seg.match(/const p = ([^\n]+)\n\s*cache\.set\(([^\n]+)\)/)
      if (m) {
        const repl = `const p = Promise.resolve().then(${m[1].replace(/^fn\(\)$/, 'fn')})
  cache.set(${m[2]})
  p.catch(() => { const cur = cache.get(key); if (cur && cur.value === p) cache.delete(key) })`
        s = s.replace(m[0], repl)
        fs.writeFileSync(file, s, 'utf8')
        done.push('B16 ' + file + ' 失败不缓存（宽松）')
      } else {
        miss.push('B16 ' + file)
      }
    } else {
      miss.push('B16 ' + file + '（无 cached）')
    }
  }
}

/* ============ B17: 取流总超时覆盖单源最坏预算 ============ */
{
  const p = 'app/lib/source-manager.js'
  let s = fs.readFileSync(p, 'utf8')
  const old = `}, 9000)`
  if (s.includes(old)) {
    s = s.replace(old, `}, 12000)   /* B17: 原来 9000 < 5000(call)+6000(probe)=11000，慢源必被判死 */`)
    fs.writeFileSync(p, s, 'utf8')
    done.push('B17 总超时 9000→12000')
  } else {
    /* 找竞速超时 */
    const m = s.match(/setTimeout\([^,]+,\s*(\d{4,5})\)/)
    if (m) {
      console.log('  B17 候选超时: ' + m[0])
      if (Number(m[1]) < 12000) {
        s = s.replace(m[0], m[0].replace(m[1], '12000'))
        fs.writeFileSync(p, s, 'utf8')
        done.push('B17 超时改为 12000')
      }
    } else {
      miss.push('B17 竞速超时')
    }
  }
}

/* ============ B18: /api/url 与 /api/stream 加 in-flight 合并 ============ */
{
  const p = 'app/server.js'
  let s = fs.readFileSync(p, 'utf8')

  if (!s.includes('const urlInflight')) {
    const anchor = 'const urlCache = new Map()'
    if (s.includes(anchor)) {
      s = s.replace(anchor, anchor + `
/* B18: 同一首歌并发请求时只跑一次解析 */
const urlInflight = new Map()`)
      done.push('B18 注入 urlInflight')
    }
  }

  /* /api/url 的缓存查询后面包一层 in-flight */
  const urlOld = `    const hit = urlCache.get(cacheKey)
    if (hit && hit.exp > Date.now()) return Object.assign({ id, source: platform, cached: true }, hit.value)
    await loadPromise.catch(() => {})`

  const urlNew = `    const hit = urlCache.get(cacheKey)
    if (hit && hit.exp > Date.now()) return Object.assign({ id, source: platform, cached: true }, hit.value)
    /* B18: 已有同样的请求在飞，直接复用 */
    if (urlInflight.has(cacheKey)) return urlInflight.get(cacheKey)
    const job = (async () => {
      await loadPromise.catch(() => {})`

  if (s.includes(urlOld)) {
    s = s.replace(urlOld, urlNew)
    /* 找到该函数结尾的 return payload 并收尾 */
    const payEnd = `    urlCache.set(cacheKey, { value: payload, exp: Date.now() + 5 * 60e3 })
    if (urlCache.size > 300) urlCache.delete(urlCache.keys().next().value)
    return payload
  },`
    if (s.includes(payEnd)) {
      s = s.replace(payEnd, `      urlCache.set(cacheKey, { value: payload, exp: Date.now() + 5 * 60e3 })
      if (urlCache.size > 300) urlCache.delete(urlCache.keys().next().value)
      return payload
    })().finally(() => urlInflight.delete(cacheKey))
    urlInflight.set(cacheKey, job)
    return job
  },`)
      done.push('B18 /api/url 复用 in-flight')
    } else {
      miss.push('B18 /api/url 结尾')
    }
  } else {
    miss.push('B18 /api/url 开头')
  }

  fs.writeFileSync(p, s, 'utf8')
}

/* ============ B47: LRU 缓存 ============ */
{
  const p = 'app/server.js'
  let s = fs.readFileSync(p, 'utf8')
  if (!s.includes('function cacheGet')) {
    const anchor = 'const urlCache = new Map()'
    if (s.includes(anchor)) {
      s = s.replace(anchor, anchor + `
/* B47: LRU 读取/写入（命中时提升到最新） */
function cacheGet (map, key) {
  const hit = map.get(key)
  if (!hit) return null
  if (hit.exp <= Date.now()) { map.delete(key); return null }
  map.delete(key); map.set(key, hit)
  return hit.value
}
function cacheSet (map, key, value, ttl, max) {
  map.delete(key)
  map.set(key, { value, exp: Date.now() + ttl })
  if (map.size > max) map.delete(map.keys().next().value)
}`)
      done.push('B47 注入 cacheGet/cacheSet')
    }
  }
  fs.writeFileSync(p, s, 'utf8')
}

/* ============ B41: 写盘合并 + 上限延迟 + 信号 flush ============ */
{
  const p = 'app/server.js'
  let s = fs.readFileSync(p, 'utf8')

  const saveOld = `function saveDb () {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try { writeDbNow() } catch (e) { console.warn('保存数据失败', e.message) }
  }, 300)
}`

  const saveNew = `/* B41: 合并写入 + 上限延迟（连续拖音量不会永远不落盘）+ 失败向上抛 */
let dbDirty = false
let dbFirstDirtyAt = 0

function saveDb () {
  dbDirty = true
  if (!dbFirstDirtyAt) dbFirstDirtyAt = Date.now()
  clearTimeout(saveTimer)
  /* 第一次脏之后最多等 2 秒，之后立刻写 */
  const wait = Date.now() - dbFirstDirtyAt > 2000 ? 0 : 300
  saveTimer = setTimeout(flushDb, wait)
}

function flushDb () {
  if (!dbDirty) return
  clearTimeout(saveTimer)
  saveTimer = null
  dbDirty = false
  dbFirstDirtyAt = 0
  try {
    writeDbNow()
  } catch (e) {
    dbDirty = true
    console.error('[db] 写盘失败', e.message)
    throw e
  }
}`

  if (s.includes(saveOld)) {
    s = s.replace(saveOld, saveNew)
    done.push('B41 saveDb 合并+上限延迟')
  } else {
    miss.push('B41 saveDb')
  }

  /* 信号 flush */
  const sigOld = `process.on('SIGINT', () => { server.close(); process.exit(0) })`
  if (s.includes(sigOld)) {
    s = s.replace(sigOld, `/* B41: 所有退出路径都落盘 */
function shutdownGracefully (code) {
  try { flushDb() } catch (e) { }
  try { server.close() } catch (e) { }
  process.exit(code || 0)
}
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  try { process.on(sig, () => shutdownGracefully(0)) } catch (e) { }
}
process.on('exit', () => { try { flushDb() } catch (e) { } })`)
    done.push('B41 信号路径 flush')
  } else {
    miss.push('B41 SIGINT')
  }

  fs.writeFileSync(p, s, 'utf8')
}

/* ============ B42: loadAll 共享 loading promise ============ */
{
  const p = 'app/lib/source-manager.js'
  let s = fs.readFileSync(p, 'utf8')
  const old = `  async loadAll () {
    if (this.loading) return this.loading`
  if (s.includes(old)) {
    s = s.replace(old, `  async loadAll () {
    /* B42: 进行中的加载共享给后来者，不要直接 return undefined */
    if (this._loadingPromise) return this._loadingPromise`)
    done.push('B42 loadAll 共享 promise（部分）')
  } else {
    const idx = s.indexOf('async loadAll')
    if (idx > 0) console.log('  B42 loadAll 形态: ' + s.slice(idx, idx + 200).replace(/\n/g, ' | ').slice(0, 160))
  }
  fs.writeFileSync(p, s, 'utf8')
}

console.log('=== 已完成 ===')
done.forEach((d) => console.log('  ✓ ' + d))
if (miss.length) {
  console.log('=== 未匹配（需手工）===')
  miss.forEach((m) => console.log('  ⚠ ' + m))
}
