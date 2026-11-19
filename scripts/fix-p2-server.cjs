'use strict'
/* 第 4 批：把 audit3 报告里剩下的 P2 修完（服务端） */
const path = require('node:path')
process.chdir(path.resolve(__dirname, '..'))
const fs = require('node:fs')
const p = 'app/server.js'
let s = fs.readFileSync(p, 'utf8')
const done = []
const miss = []

/* ============ B51: /api/settings 空 cookie 不覆盖 + 前端不回填 ============ */
{
  const old = `  async '/api/settings' (req, q, res, body) {
    if (body) {
      Object.assign(db.settings, body)`
  if (s.includes(old)) {
    s = s.replace(old, `  async '/api/settings' (req, q, res, body) {
    if (body) {
      /* B51: 脱敏后前端拿不到 qqCookie，输入框永远是空的。
         用户点保存会提交 {qqCookie: ''}，把真 Cookie 洗掉。
         这里做「空值不覆盖」。 */
      const patch = Object.assign({}, body)
      if (patch.qqCookie === undefined || patch.qqCookie === '' || patch.qqCookie === null) {
        delete patch.qqCookie
      }
      Object.assign(db.settings, patch)`)
    done.push('B51 空 cookie 不覆盖')
  } else {
    const i = s.indexOf("async '/api/settings'")
    if (i > 0) console.log('  B51 现场:\n' + s.slice(i, i + 300))
    else miss.push('B51 settings')
  }
}

/* ============ B47: 把 cacheGet/cacheSet 接到实际调用点 ============ */
{
  const cnt0 = (s.match(/cacheGet\(urlCache/g) || []).length
  if (cnt0 === 0) {
    /* 替换 urlCache.get / urlCache.set */
    const before = s
    s = s.replace(/const hit = urlCache\.get\(cacheKey\)\n\s*if \(hit && hit\.exp > Date\.now\(\)\)/g,
      'const hitVal = cacheGet(urlCache, cacheKey)\n    if (hitVal)')
    if (s !== before) done.push('B47 部分替换 urlCache.get')

    /* 更稳妥：直接替换全部 urlCache.get(...) 调用 */
    s = s.replace(/urlCache\.get\(([^)]+)\)/g, (m, k) => {
      if (m.includes('cacheGet')) return m
      return 'cacheGet(urlCache, ' + k + ')'
    })
    s = s.replace(/urlCache\.set\(([^,]+),\s*(\{[^}]*\})\)/g, 'cacheSet(urlCache, $1, $2, 5 * 60e3, 300)')
    /* 删掉手写的 size > 300 分支 */
    s = s.replace(/\s*if \(urlCache\.size > 300\) urlCache\.delete\(urlCache\.keys\(\)\.next\(\)\.value\)/g, '')
    done.push('B47 接到 cacheGet/cacheSet')
  } else {
    done.push('B47 已接线（' + cnt0 + ' 处）')
  }
}

/* ============ B17: 超时改成覆盖两档最坏 ============ */
{
  const p2 = 'app/lib/source-manager.js'
  let t = fs.readFileSync(p2, 'utf8')
  const old = `}, 12000)   /* B17: 原来 9000 < 5000(call)+6000(probe)=11000，慢源必被判死 */`
  if (t.includes(old)) {
    t = t.replace(old, `}, 24000)   /* B17: tries 最多 2 档，每档 5000(call)+6000(probe)=11000，
                                     两档最坏 22000。原来 12000 盖不住，会把「第一档超时、第二档能成」的慢源判死 */`)
    fs.writeFileSync(p2, t, 'utf8')
    done.push('B17 超时 12000 → 24000')
  } else {
    const m = t.match(/setTimeout\([^,]+,\s*(1[0-9]{4})\)/)
    if (m) {
      t = t.replace(m[0], m[0].replace(/\d{4,5}/, '24000'))
      fs.writeFileSync(p2, t, 'utf8')
      done.push('B17 超时（宽松） → 24000')
    } else {
      miss.push('B17 超时')
    }
  }
}

/* ============ B36: brotli 加 maxOutputLength ============ */
{
  const p3 = 'app/lib/lx-engine.js'
  let t = fs.readFileSync(p3, 'utf8')
  const old = `else if (enc.includes('br')) buf = zlib.brotliDecompressSync(buf)`
  if (t.includes(old)) {
    t = t.replace(old, `else if (enc.includes('br')) buf = zlib.brotliDecompressSync(buf, MAX_OUT)   /* B36: 补上解压上限 */`)
    fs.writeFileSync(p3, t, 'utf8')
    done.push('B36 brotli maxOutputLength')
  } else {
    miss.push('B36 brotli')
  }
}

/* ============ B34: convOut 也放进清理集合 ============ */
{
  const old = `      for (const f of new Set([tmpFile, finalTmp])) {`
  if (s.includes(old)) {
    s = s.replace(old, `      /* B34: 转码失败时 finalTmp 还是 tmpFile，convOut 半成品会漏掉 */
      for (const f of new Set([tmpFile, finalTmp, tmpFile + '.' + wantFmt])) {`)
    done.push('B34 convOut 也清理')
  } else {
    miss.push('B34 清理集合')
  }
}

/* ============ B39: intParam 空串/0 回落到默认值 ============ */
{
  const old = `function intParam (raw, def, min, max) {
  const n = Number(raw)
  if (!Number.isFinite(n)) return def
  return Math.min(max, Math.max(min, Math.trunc(n)))
}`
  if (s.includes(old)) {
    s = s.replace(old, `function intParam (raw, def, min, max) {
  /* B39: Number('') === 0，会被 clamp 到 min；这里空串直接回默认值 */
  if (raw === null || raw === undefined || String(raw).trim() === '') return def
  const n = Number(raw)
  if (!Number.isFinite(n)) return def
  if (n === 0) return def
  return Math.min(max, Math.max(min, Math.trunc(n)))
}`)
    done.push('B39 intParam 空串回落')
  } else {
    miss.push('B39 intParam')
  }

  /* /api/discover 也迁到 intParam */
  const dOld = `      const offset = Math.max(0, Number(q.get('offset') || 0))
      const limit = Math.min(60, Math.max(6, Number(q.get('limit') || 30)))`
  if (s.includes(dOld)) {
    s = s.replace(dOld, `      const offset = intParam(q.get('offset'), 0, 0, 100000)    /* B39 */
      const limit = intParam(q.get('limit'), 30, 6, 60)`)
    done.push('B39 discover 迁到 intParam')
  }
}

/* ============ B6: isPrivateHost 支持 [::1] / 127.1 / IPv4-mapped ============ */
{
  const old = `function isPrivateHost (h) {
  if (!h) return true
  const host = String(h).toLowerCase()`
  if (s.includes(old)) {
    s = s.replace(old, `function isPrivateHost (h) {
  if (!h) return true
  /* B6: URL.hostname 对 IPv6 会带方括号（'[::1]'），net.isIPv6 判不出来；
     还要处理 127.1（简写）、0x7f.0.0.1（十六进制）、::ffff:127.0.0.1（IPv4-mapped） */
  let host = String(h).toLowerCase().replace(/^\\[|\\]$/g, '').replace(/\\.$/, '')
  if (/^::ffff:(\\d+\\.\\d+\\.\\d+\\.\\d+)$/.test(host)) host = host.replace(/^::ffff:/, '')
  if (/^0x[0-9a-f]+$/i.test(host)) { try { host = String(parseInt(host, 16)) } catch (e) { } }
  if (/^\\d+$/.test(host)) { try { host = '0.0.0.' + host } catch (e) { } }`)
    done.push('B6 isPrivateHost 规范化')
  } else {
    miss.push('B6 isPrivateHost')
  }
}

/* ============ B33: decodeURIComponent 进 try ============ */
{
  const old = `  let rel = decodeURIComponent(pathname === '/' ? '/index.html' : pathname)`
  if (s.includes(old)) {
    s = s.replace(old, `  /* B33: 畸形百分号编码（/%E0%A4%A）会抛 URIError，落进外层 catch 变 500 */
  let rel
  try {
    rel = decodeURIComponent(pathname === '/' ? '/index.html' : pathname)
  } catch (e) {
    return json(res, 400, { error: '非法请求路径' })
  }`)
    done.push('B33 decodeURIComponent 进 try')
  } else {
    miss.push('B33 decodeURIComponent')
  }
}

/* ============ B42: loadPromise 补 .catch ============ */
{
  const m = s.match(/const loadPromise = sourceManager\.loadAll\(\)\.then\(\(\) => \{/)
  if (m && !s.includes('loadPromise = sourceManager.loadAll().then(...).catch')) {
    /* 找 loadPromise 链的结尾 */
    const i = s.indexOf('const loadPromise = sourceManager.loadAll()')
    const seg = s.slice(i, i + 500)
    /* 简单做法：在声明后补一个 .catch 包装 */
    const endIdx = seg.indexOf('\n})') >= 0 ? seg.indexOf('\n})') + 3 : -1
    if (endIdx > 0) {
      const abs = i + endIdx
      s = s.slice(0, abs) + `.catch((e) => { console.error('[音源] 加载失败:', e && e.message) })` + s.slice(abs)
      done.push('B42 loadPromise 补 .catch')
    } else {
      miss.push('B42 loadPromise 结尾')
    }
  }
}

fs.writeFileSync(p, s, 'utf8')
console.log('=== 已完成 ===')
done.forEach((d) => console.log('  ✓ ' + d))
if (miss.length) {
  console.log('=== 未匹配 ===')
  miss.forEach((m) => console.log('  ⚠ ' + m))
}
