'use strict'
/* 第二批：服务端 P1/P2 */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

const done = []
const miss = []

/* ============ S1: /api/sources/test 加超时 ============ */
{
  const p = 'app/lib/source-manager.js'
  let s = fs.readFileSync(p, 'utf8')
  const old = `        const url = await entry.script.musicUrl(platform, musicInfo, quality)`
  if (s.includes(old)) {
    s = s.replace(old, () => `        /* P1: 这里原来没有超时。脚本的 musicUrl 只要不 settle
           （网络挂住 / await 一个永不返回的 Promise / TCP 半开），
           整个 /api/sources/test 就永久挂起，前端按钮一直转圈。
           resolveUrl 那条路径有 5 秒超时，这里保持一致。 */
        const url = await callWithTimeout(() => entry.script.musicUrl(platform, musicInfo, quality), 5000)`)
    done.push('S1 testAll 单源 5 秒超时')
  } else {
    const i = s.indexOf('entry.script.musicUrl')
    if (i > 0) console.log('  S1 现场: ' + s.slice(i - 120, i + 120).replace(/\s+/g, ' '))
    miss.push('S1 testAll')
  }
  fs.writeFileSync(p, s, 'utf8')
}

/* ============ S1b: testAll 外层总预算（路由层） ============ */
{
  const p = 'app/server.js'
  let s = fs.readFileSync(p, 'utf8')
  const old = `      const list = M ? await M.testAll(platform) : []`
  const old2 = `await sourceManager.testAll(platform)`
  let hit = false
  if (s.includes(old2)) {
    const i = s.indexOf(old2)
    const ls = s.lastIndexOf('\n', i) + 1
    const le = s.indexOf('\n', i)
    const line = s.slice(ls, le)
    s = s.slice(0, ls) + `      /* P1: 加 12 秒总预算，避免 N 个源串行累加 */\n      const list = await Promise.race([\n        sourceManager.testAll(platform),\n        new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('音源测试超时'), { code: 504 })), 12000)),\n      ])` + s.slice(le)
    hit = true
    done.push('S1b testAll 路由层 12 秒预算')
  }
  if (!hit) {
    const i = s.indexOf('/api/sources/test')
    if (i > 0) console.log('  S1b 现场: ' + s.slice(i, i + 300).replace(/\s+/g, ' '))
    miss.push('S1b testAll 路由')
  }
  fs.writeFileSync(p, s, 'utf8')
}

/* ============ S4: /api/download 进 WRITE_PATHS + save=1 要求 POST ============ */
{
  const p = 'app/server.js'
  let s = fs.readFileSync(p, 'utf8')

  if (!s.includes("'/api/download',")) {
    const anchor = `        '/api/sources/test',`
    if (s.includes(anchor)) {
      s = s.replace(anchor, () => `${anchor}
        '/api/download',`)
      done.push('S4a /api/download 进写名单')
    } else {
      miss.push('S4a WRITE_PATHS')
    }
  } else {
    done.push('S4a /api/download 已在内')
  }

  /* handler 开头：save=1 必须 POST */
  const hOld = `  async '/api/download' (req, q, res) {`
  if (s.includes(hOld)) {
    s = s.replace(hOld, () => `  async '/api/download' (req, q, res) {
    /* P1: save=1 会往用户磁盘写文件，必须 POST。
       否则任何网页用一个 <img src="...&save=1"> 就能触发（跨站 GET 不带 Origin）。 */
    if (q.get('save') === '1' && req.method !== 'POST' && req.method !== 'PUT') {
      throw Object.assign(new Error('保存下载需要 POST'), { code: 405 })
    }`)
    done.push('S4b save=1 要求 POST')
  } else {
    const i = s.indexOf("/api/download'")
    if (i > 0) console.log('  S4b 现场: ' + s.slice(i, i + 160).replace(/\s+/g, ' '))
    miss.push('S4b download handler')
  }
  fs.writeFileSync(p, s, 'utf8')
}

/* ============ S5: sameOrigin 的 Host 白名单（防 DNS rebinding） ============ */
{
  const p = 'app/server.js'
  let s = fs.readFileSync(p, 'utf8')
  const start = s.indexOf('function sameOrigin (')
  if (start > 0) {
    const bs = s.indexOf('{', start)
    let d = 0
    let e = bs
    for (let k = bs; k < s.length; k++) {
      if (s[k] === '{') d++
      else if (s[k] === '}') { d--; if (d === 0) { e = k + 1; break } }
    }
    const newFn = `function sameOrigin (req) {
  /* Host 头由请求方决定，不能当信任锚 —— 否则 DNS rebinding 直接绕过：
     evil.example 解析到 127.0.0.1 后，浏览器同时发 Host 和 Origin 都是 evil.example，
     两者相等就被放行。这里先验 Host 必须是本机地址。 */
  const hostRaw = String(req.headers.host || '')
  const hostName = hostRaw.replace(/:\\d+$/, '').replace(/^\\[|\\]$/g, '').toLowerCase()
  const isLocalHost = hostName === 'localhost' || hostName === '127.0.0.1' || hostName === '::1' ||
    (Array.isArray(global.__LAN_IPS) && global.__LAN_IPS.indexOf(hostName) !== -1)
  if (hostName && !isLocalHost) return false

  const o = req.headers.origin
  if (!o) return true                    /* 无 Origin 的本地请求（curl / 外壳）放行 */
  if (o === 'null') return false         /* 沙箱 iframe 可伪造 */
  let u = null
  try { u = new URL(o) } catch (err) { return false }
  const oName = String(u.hostname || '').replace(/^\\[|\\]$/g, '').toLowerCase()
  if (oName === hostName) return true
  if (oName === '127.0.0.1' || oName === 'localhost' || oName === '::1') return true
  if (Array.isArray(global.__LAN_IPS) && global.__LAN_IPS.indexOf(oName) !== -1) return true
  return false
}`
    s = s.slice(0, start) + newFn + s.slice(e)
    done.push('S5 sameOrigin 加 Host 白名单')
  } else {
    miss.push('S5 sameOrigin')
  }
  fs.writeFileSync(p, s, 'utf8')
}

/* ============ S6: /api/settings 键白名单 ============ */
{
  const p = 'app/server.js'
  let s = fs.readFileSync(p, 'utf8')
  const old = `      const patch = Object.assign({}, body)
      /* P3-5: 显式清空用 clearQqCookie，空串仍然表示「不修改」 */
      if (patch.clearQqCookie === true) {
        patch.qqCookie = ''
      } else if (patch.qqCookie === undefined || patch.qqCookie === '' || patch.qqCookie === null) {
        delete patch.qqCookie
      }
      delete patch.clearQqCookie
      Object.assign(db.settings, patch)`
  if (s.includes(old)) {
    s = s.replace(old, () => `      /* P2: 只接受已知键。原来 Object.assign 任意键直落，
         可以绕过 /api/download-dir 的目录校验写坏 downloadDir。 */
      const ALLOW = ['quality', 'platform', 'volume', 'sourceOrder', 'disabledSources', 'qqCookie',
        'theme', 'themeMode', 'sleepMinutes', 'dlFormat', 'themeFromCover']
      const patch = {}
      for (const k of ALLOW) {
        if (body && Object.prototype.hasOwnProperty.call(body, k)) patch[k] = body[k]
      }
      /* downloadDir 走独立校验：必须能创建且可写，否则 400 */
      if (body && typeof body.downloadDir === 'string') {
        const dir = body.downloadDir.trim()
        if (dir) {
          let mkErr = ''
          try { fs.mkdirSync(dir, { recursive: true }) } catch (err2) { mkErr = err2.code + ': ' + err2.message }
          if (mkErr) throw Object.assign(new Error('目录无法创建（' + mkErr + '）'), { code: 400 })
          let wErr = ''
          try {
            const probe = path.join(dir, 'w_test.tmp')
            fs.writeFileSync(probe, 'ok')
            fs.unlinkSync(probe)
          } catch (err3) { wErr = err3.code + ': ' + err3.message }
          if (wErr) throw Object.assign(new Error('目录不可写（' + wErr + '）'), { code: 400 })
          patch.downloadDir = dir
        } else {
          patch.downloadDir = ''
        }
      }
      /* P3-5: 显式清空用 clearQqCookie，空串仍然表示「不修改」 */
      if (body && body.clearQqCookie === true) {
        patch.qqCookie = ''
      } else if (patch.qqCookie === undefined || patch.qqCookie === '' || patch.qqCookie === null) {
        delete patch.qqCookie
      }
      Object.assign(db.settings, patch)`)
    done.push('S6 /api/settings 键白名单')
  } else {
    miss.push('S6 settings 白名单')
  }
  fs.writeFileSync(p, s, 'utf8')
}

/* ============ S7: /api/stream 用 cacheSet 而不是裸 set ============ */
{
  const p = 'app/server.js'
  let s = fs.readFileSync(p, 'utf8')
  const old = `        urlCache.set(cacheKey, {
          value: { id, source: platform, quality: result.quality, provider: result.provider, url: target },
          exp: Date.now() + 5 * 60e3,
        })`
  if (s.includes(old)) {
    s = s.replace(old, () => `        /* P2: 原来这里用裸 Map.set，绕过了 cacheSet 的 300 条上限与 LRU，
           长期运行会只增不减。 */
        cacheSet(urlCache, cacheKey,
          { id, source: platform, quality: result.quality, provider: result.provider, url: target },
          5 * 60e3, 300)`)
    done.push('S7 /api/stream 改用 cacheSet')
  } else {
    const i = s.indexOf('urlCache.set(cacheKey')
    if (i > 0) console.log('  S7 现场: ' + s.slice(i - 60, i + 200).replace(/\s+/g, ' '))
    miss.push('S7 stream cacheSet')
  }
  fs.writeFileSync(p, s, 'utf8')
}

/* ============ S8: QQ api() 用动态 cookie ============ */
{
  const p = 'app/lib/qq.js'
  let s = fs.readFileSync(p, 'utf8')
  if (!s.includes('headersNow')) {
    /* 加 headersNow */
    const anchor = `function api (url, timeout = 15000) {`
    if (s.includes(anchor)) {
      s = s.replace(anchor, () => `/* P2: 设置里粘贴的 cookie 之前只被 playlist-import 用到，
   搜索/详情/歌词全都发静态 HEADERS，等于填了也不生效。 */
function headersNow () {
  try {
    const c = currentCookie()
    if (c) return Object.assign({}, HEADERS, { Cookie: c })
  } catch (e) { }
  return HEADERS
}

function api (url, timeout = 15000) {`)
      /* 把 api 里的 headers: HEADERS 换掉 */
      const i = s.indexOf(anchor)
      const bs = s.indexOf('{', i)
      let d = 0
      let e = bs
      for (let k = bs; k < s.length; k++) {
        if (s[k] === '{') d++
        else if (s[k] === '}') { d--; if (d === 0) { e = k + 1; break } }
      }
      let body = s.slice(bs, e)
      const before = body
      body = body.replace(/headers:\s*HEADERS/g, 'headers: headersNow()')
      if (body !== before) {
        s = s.slice(0, bs) + body + s.slice(e)
        done.push('S8 QQ api() 用动态 cookie')
      } else {
        miss.push('S8 api headers 替换')
      }
    } else {
      miss.push('S8 api 锚点')
    }
  } else {
    done.push('S8 已存在')
  }
  fs.writeFileSync(p, s, 'utf8')
}

console.log('=== 完成 ===')
done.forEach((d) => console.log('  ✓ ' + d))
if (miss.length) {
  console.log('\n=== 未处理 ===')
  miss.forEach((m) => console.log('  ⚠ ' + m))
}