'use strict'
/* 修第三轮服务端审查的 P0/P1 回归 */
const path = require('node:path')
process.chdir(path.resolve(__dirname, '..'))
const fs = require('node:fs')
const p = 'app/server.js'
let s = fs.readFileSync(p, 'utf8')
const done = []
const miss = []

/* ============ P0-1: B7 /api/download-dir 被 WRITE_PATHS 一刀切（405）============ */
{
  const old = `        '/api/download-dir',`
  if (s.includes(old)) {
    s = s.replace(old, '')
    done.push('P0-1 移除 /api/download-dir 强制 POST')
  } else {
    console.log('  /api/download-dir 已在名单外或格式不同')
  }

  /* 在 handler 内部单独判定写语义 */
  const handler = `  async '/api/download-dir' (req, q) {`
  if (s.includes(handler) && !s.includes('/* P0-1: 写语义在这里单独判定')) {
    s = s.replace(handler, `  async '/api/download-dir' (req, q) {
    /* P0-1: 这个接口同时承担「读」（GET，返回当前目录）和「写」（?set=/?open=）。
       整条路径塞进 WRITE_PATHS 会让读取也 405，下载目录功能整块失效。
       这里只对写操作要求 POST。 */
    if ((q.get('set') || q.get('open')) && req.method !== 'POST' && req.method !== 'PUT') {
      throw Object.assign(new Error('仅支持 POST'), { code: 405 })
    }`)
    done.push('P0-1 handler 内判定写操作')
  }
}

/* ============ P0-2: B41 flushDb throw 在 setTimeout 里 → 崩进程 ============ */
{
  const old = `function flushDb () {
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

  const neu = `function flushDb () {
  if (!dbDirty) return
  clearTimeout(saveTimer)
  saveTimer = null
  try {
    writeDbNow()
    dbDirty = false
    dbFirstDirtyAt = 0
  } catch (e) {
    /* P0-2: 绝不能往外抛 —— flushDb 唯一的常规调用点是 setTimeout 回调，
       抛出去就是 uncaughtException，整个播放器会被一次写盘失败干掉。
       这里改成 3 秒后重试，自愈。 */
    dbDirty = true
    console.error('[db] 写盘失败，3 秒后重试:', e.message)
    if (!saveTimer) saveTimer = setTimeout(flushDb, 3000)
  }
}`

  if (s.includes(old)) {
    s = s.replace(old, neu)
    done.push('P0-2 flushDb 不再抛 + 3 秒重试')
  } else {
    const i = s.indexOf('function flushDb')
    if (i > 0) console.log('  flushDb 现场:\n' + s.slice(i, i + 500))
    else miss.push('flushDb')
  }

  /* 兜底：加 uncaughtException，别让任何后台回调打死进程 */
  if (!s.includes("process.on('uncaughtException'")) {
    const anchor = `process.on('exit',`
    if (s.includes(anchor)) {
      s = s.replace(anchor, `/* P0-2: 兜底，后台回调的意外异常不应该让整个播放器退出 */
process.on('uncaughtException', (e) => {
  try { console.error('[fatal] 未捕获异常:', e && e.stack ? e.stack : e) } catch (err) { }
})

${anchor}`)
      done.push('P0-2 uncaughtException 兜底')
    }
  }
}

/* ============ P1-1: waitForAnySource 按平台判定 ============ */
{
  const old = `async function waitForAnySource (maxMs = 8000) {
  const t0 = Date.now()
  while (Date.now() - t0 < maxMs) {
    try {
      const entries = sourceManager && sourceManager.entries
      if (entries && entries.size > 0) {
        for (const e of entries.values()) {
          if (e.status === 'ok' && e.script) return true
        }
      }
    } catch (err) { }
    await new Promise((r) => setTimeout(r, 150))
  }
  return false
}`

  const neu = `async function waitForAnySource (platform, maxMs = 8000) {
  /* P1-1: 必须按平台判。「任一源就绪」不等于「有源支持 wy」——
     冷启动时先就绪的可能是只支持 tx 的源，此时放行会让
     sourceManager.resolveUrl 直接抛「没有可用的音源脚本支持 wy」。 */
  const deadline = Date.now() + maxMs
  while (Date.now() < deadline) {
    try {
      const entries = sourceManager && sourceManager.entries
      if (entries && entries.size > 0) {
        for (const e of entries.values()) {
          if (e.status === 'ok' && e.script) {
            if (!platform) return true
            const srcs = e.sources || (e.script && e.script.sources) || {}
            if (srcs && srcs[platform]) return true
          }
        }
      }
    } catch (err) { }
    await new Promise((r) => setTimeout(r, 150))
  }
  /* 兜底：仍没找到平台源时，再给 loadAll 最多 3 秒，别把「还在加载」报成「没有源」 */
  await Promise.race([
    loadPromise.catch(() => { }),
    new Promise((r) => setTimeout(r, 3000)),
  ])
  return false
}`

  if (s.includes(old)) {
    s = s.replace(old, neu)
    done.push('P1-1 waitForAnySource 按平台判定')
  } else {
    const i = s.indexOf('async function waitForAnySource')
    if (i > 0) console.log('  waitForAnySource 形态:\n' + s.slice(i, i + 600))
    else miss.push('waitForAnySource')
  }

  /* 调用处传 platform */
  const callOld = `    await waitForAnySource()`
  const cnt = (s.match(/await waitForAnySource\(\)/g) || []).length
  if (cnt > 0) {
    s = s.split('await waitForAnySource()').join('await waitForAnySource(platform)')
    done.push('P1-1 调用处传 platform（' + cnt + ' 处）')
  }
}

/* ============ P1-2: sameOrigin 支持 LAN / 同上源 ============ */
{
  const old = `function sameOrigin (req) {
  const o = req.headers.origin
  if (!o) return true                       /* 同源 fetch / 无 Origin 的本地请求放行 */
  return /^https?:\\/\\/(127\\.0\\.0\\.1|localhost|\\[::1\\])(:\\d+)?$/.test(o)
}`

  const neu = `function sameOrigin (req) {
  const o = req.headers.origin
  /* P1-2: 无 Origin 的本地请求（curl / 外壳）放行；'null' 只出现在沙箱 iframe / file:// */
  if (!o) return true
  if (o === 'null') return true
  let u = null
  try { u = new URL(o) } catch (e) { return false }
  /* 同主机同端口（含局域网 IP、[::1]）—— 手机浏览器访问时 Origin 就是 LAN 地址 */
  const host = String(req.headers.host || '')
  if (host && u.host === host) return true
  if (/^(127\\.0\\.0\\.1|localhost|\\[::1\\])$/.test(u.hostname)) return true
  /* 开局域网模式时，本机所有网卡地址也放行 */
  try {
    if ((global.__LAN_IPS || []).includes(u.hostname)) return true
  } catch (e) { }
  return false
}`

  if (s.includes(old)) {
    s = s.replace(old, neu)
    done.push('P1-2 sameOrigin 支持 LAN')
  } else {
    const i = s.indexOf('function sameOrigin')
    if (i > 0) console.log('  sameOrigin 形态:\n' + s.slice(i, i + 400))
    else miss.push('sameOrigin')
  }
}

/* ============ P1-3: downloads/remove 进写名单 + 不回显绝对路径 ============ */
{
  const anchor = `        '/api/shutdown',`
  if (s.includes(anchor) && !s.includes("'/api/downloads/remove'")) {
    s = s.replace(anchor, `${anchor}
        '/api/downloads/remove',`)
    done.push('P1-3 downloads/remove 进写名单')
  }

  const retOld = `    return { ok: true, path: removed }`
  if (s.includes(retOld)) {
    s = s.replace(retOld, `    return { ok: true, name }    /* P1-3: 不回显绝对路径 */`)
    done.push('P1-3 remove 不回显绝对路径')
  }
}

fs.writeFileSync(p, s, 'utf8')
console.log('=== 已完成 ===')
done.forEach((d) => console.log('  ✓ ' + d))
if (miss.length) {
  console.log('=== 未匹配 ===')
  miss.forEach((m) => console.log('  ⚠ ' + m))
}
