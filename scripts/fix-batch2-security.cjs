'use strict'
/* 第 2 批安全修复：B6 / B7 / B14 / B15 / B44 / B51 */
const fs = require('node:fs')

const p = 'app/server.js'
let s = fs.readFileSync(p, 'utf8')
const done = []
const miss = []

/* ============ 工具：注入 guard / intParam / isPrivateHost ============ */
if (!s.includes('function isPrivateHost')) {
  const anchor = 'function readBody (req, limit = 5 * 1024 * 1024) {'
  if (!s.includes(anchor)) { console.log('⚠ readBody 锚点未找到'); process.exit(1) }

  const helpers = `
/* ---------------- 安全工具（BUG-REPORT-2） ---------------- */

/* B7: 本地会话 token。外壳启动时通过 env 注入，前端通过 /api/health 拿到 */
const SESSION_TOKEN = process.env.PHONOGRAPH_TOKEN || crypto.randomBytes(24).toString('hex')

/* B7: 同源校验 —— 只接受本机 origin，防止恶意网页跨站 POST */
function sameOrigin (req) {
  const o = req.headers.origin
  if (!o) return true                       /* 同源 fetch / 无 Origin 的本地请求放行 */
  return /^https?:\\/\\/(127\\.0\\.0\\.1|localhost|\\[::1\\])(:\\d+)?$/.test(o)
}

/* B7: 写接口守卫。needWrite=true 时强制 POST/PUT */
function guard (req, res, needWrite) {
  if (!sameOrigin(req)) {
    json(res, 403, { error: '来源不允许' })
    return false
  }
  const tok = req.headers['x-phonograph-token']
  if (tok !== undefined && tok !== SESSION_TOKEN) {
    json(res, 403, { error: '令牌无效' })
    return false
  }
  if (needWrite && req.method !== 'POST' && req.method !== 'PUT') {
    json(res, 405, { error: '仅支持 POST' })
    return false
  }
  return true
}

/* B6: 私有地址判定 */
function isPrivateHost (h) {
  if (!h) return true
  const host = String(h).toLowerCase()
  if (typeof net.isIPv4 === 'function' && net.isIPv4(host)) {
    const [a, b] = host.split('.').map(Number)
    return a === 10 || a === 127 || a === 0 ||
           (a === 169 && b === 254) ||
           (a === 172 && b >= 16 && b <= 31) ||
           (a === 192 && b === 168) ||
           (a === 100 && b >= 64 && b <= 127)
  }
  if (typeof net.isIPv6 === 'function' && net.isIPv6(host)) {
    return host === '::1' || /^f[cd]/i.test(host) || /^fe80/i.test(host)
  }
  return /^(localhost|.*\\.local|.*\\.internal)$/i.test(host)
}

/* B6: 封面只允许这些 CDN */
const PIC_HOST_ALLOW = [
  /(^|\\.)music\\.126\\.net$/i,
  /(^|\\.)126\\.net$/i,
  /(^|\\.)163\\.com$/i,
  /(^|\\.)gtimg\\.cn$/i,
  /(^|\\.)y\\.qq\\.com$/i,
  /(^|\\.)kugou\\.com$/i,
  /(^|\\.)kgimg\\.com$/i,
  /(^|\\.)kuwo\\.cn$/i,
  /(^|\\.)kwcdn\\.kuwo\\.cn$/i,
  /(^|\\.)migu\\.cn$/i,
  /(^|\\.)music\\.126\\.net$/i,
]

/* B39: 数字参数统一校验 */
function intParam (raw, def, min, max) {
  const n = Number(raw)
  if (!Number.isFinite(n)) return def
  return Math.min(max, Math.max(min, Math.trunc(n)))
}

`
  s = s.replace(anchor, helpers + anchor)
  done.push('注入 guard / isPrivateHost / intParam')
}

/* ============ B6: /api/pic 只允许 CDN ============ */
const picOld = `  async '/api/pic' (req, q, res) {
    const direct = q.get('url')
    if (direct) {
      if (!/^https?:\\/\\//.test(direct)) return json(res, 400, { error: '无效地址' })
      proxyStream(req, res, direct)
      return null
    }`

const picNew = `  async '/api/pic' (req, q, res) {
    const direct = q.get('url')
    if (direct) {
      /* B6: 只允许 http(s) + 已知 CDN + 非私有地址，否则就是任意 URL 代理（SSRF） */
      if (!/^https?:\\/\\//i.test(direct)) return json(res, 400, { error: '无效地址' })
      let uu = null
      try { uu = new URL(direct) } catch (e) { return json(res, 400, { error: '非法 URL' }) }
      if (isPrivateHost(uu.hostname)) return json(res, 403, { error: '不允许的图片地址' })
      if (!PIC_HOST_ALLOW.some((re) => re.test(uu.hostname))) {
        return json(res, 403, { error: '不是已知封面域名：' + uu.hostname })
      }
      proxyStream(req, res, direct)
      return null
    }`

if (s.includes(picOld)) {
  s = s.replace(picOld, picNew)
  done.push('B6 /api/pic 限制 CDN 域名')
} else {
  miss.push('B6 /api/pic')
}

/* ============ B15: /api/downloads/reveal 校验 ============ */
const revealOld = `  async '/api/downloads/reveal' (req, q) {`
if (s.includes(revealOld)) {
  /* 找到该路由的完整函数体，替换成校验版 */
  const start = s.indexOf(revealOld)
  const bodyStart = s.indexOf('{', start + revealOld.length - 1)
  let depth = 0
  let end = bodyStart
  for (let i = bodyStart; i < s.length; i++) {
    if (s[i] === '{') depth++
    else if (s[i] === '}') { depth--; if (depth === 0) { end = i + 1; break } }
  }
  const oldBody = s.slice(start, end)
  const newBody = `  async '/api/downloads/reveal' (req, q) {
    /* B15: 与 remove 同一套校验，且不回显绝对路径 */
    const name = q.get('name')
    if (!name) throw Object.assign(new Error('缺少文件名'), { code: 400 })
    if (name.includes('..') || /[\\\\/]/.test(name)) {
      throw Object.assign(new Error('非法文件名'), { code: 400 })
    }
    if (!/\\.(mp3|flac|m4a|ogg|wav)$/i.test(name)) {
      throw Object.assign(new Error('只能定位音频文件'), { code: 400 })
    }
    const roots = [...new Set([
      db.settings.downloadDir,
      defaultDownloadDir(),
      path.join(ROOT, 'downloads'),
    ].filter(Boolean))].map((d) => { try { return path.resolve(d) } catch (e) { return d } })

    let full = ''
    for (const root of roots) {
      const cand = path.resolve(root, name)
      if (!cand.startsWith(root + path.sep)) continue
      if (fs.existsSync(cand)) { full = cand; break }
    }
    if (!full) return { ok: false, error: '文件不存在' }
    try {
      const { spawn } = require('node:child_process')
      const child = spawn('explorer.exe', ['/select,', full], { detached: true, stdio: 'ignore' })
      child.on('error', () => { })
      child.unref()
      return { ok: true, name }
    } catch (e) {
      return { ok: false, error: '打开失败：' + e.message }
    }
  }`
  s = s.replace(oldBody, newBody)
  done.push('B15 reveal 路径校验')
} else {
  miss.push('B15 reveal')
}

/* ============ B14: downloads/remove 删掉 dir 参数 ============ */
const dirParam = `      q.get('dir') || '',`
if (s.includes(dirParam)) {
  s = s.replace(dirParam, '')
  done.push('B14 remove 去掉 dir 参数')
} else {
  const alt = /q\.get\('dir'\)/g
  if (alt.test(s)) {
    s = s.replace(/,\s*q\.get\('dir'\)\s*\|\|\s*''/g, '')
    done.push('B14 remove 去掉 dir 参数（宽松）')
  } else {
    miss.push('B14 dir 参数（可能已不存在）')
  }
}

/* ============ B39: search/discover 数字参数 ============ */
const numOld1 = `    const page = Number(q.get('page') || 1)`
if (s.includes(numOld1)) {
  s = s.replace(numOld1, `    const page = intParam(q.get('page'), 1, 1, 200) /* B39 */`)
  done.push('B39 search.page 校验')
}
const numOld2 = `    const limit = Math.min(60, Number(q.get('limit') || 30))`
if (s.includes(numOld2)) {
  s = s.replace(numOld2, `    const limit = intParam(q.get('limit'), 30, 1, 60) /* B39 */`)
  done.push('B39 limit 校验')
}

/* ============ B51: settings 脱敏 ============ */
if (!s.includes('function publicSettings')) {
  const anchor2 = "  async '/api/settings' (req, q, res, body) {"
  if (s.includes(anchor2)) {
    const mask = `
/* B51: 出口脱敏，不再回显完整 QQ Cookie */
function publicSettings () {
  const out = Object.assign({}, db.settings || {})
  const ck = out.qqCookie
  delete out.qqCookie
  out.qqCookieSet = !!ck
  out.qqCookieTail = ck ? String(ck).slice(-6) : ''
  return out
}
`
    s = s.replace(anchor2, mask + anchor2)
    done.push('B51 注入 publicSettings')
  }
}

fs.writeFileSync(p, s, 'utf8')
console.log('=== 已完成 ===')
done.forEach((d) => console.log('  ✓ ' + d))
if (miss.length) {
  console.log('=== 未匹配 ===')
  miss.forEach((m) => console.log('  ⚠ ' + m))
}
