'use strict'
/* 修复播放失败：
   1) probeUrl 改成「GET 前 64 字节」判断，与真实播放请求一致（念心对 HEAD 和 GET 行为不同）
   2) proxyStream 去掉 HTML/JSON 拦截，避免把能播的地址误拦成 502
*/
const fs = require('node:fs')

/* ---------- 1) source-manager.probeUrl ---------- */
const sp = 'app/lib/source-manager.js'
let s = fs.readFileSync(sp, 'utf8')

const pStart = s.indexOf('function probeUrl (url, timeout = 8000) {')
const pEnd = s.indexOf('\n}', s.indexOf('done(true)', pStart)) + 2
if (pStart < 0 || pEnd < 2) { console.log('未找到 probeUrl'); } else {
  const impl = `function probeUrl (url, timeout = 8000) {
  return new Promise((resolve) => {
    let settled = false
    const done = (v) => { if (!settled) { settled = true; clearTimeout(timer); resolve(v) } }
    const timer = setTimeout(() => done(false), timeout)
    try {
      const u = new URL(url)
      const lib = u.protocol === 'https:' ? require('node:https') : require('node:http')
      /* 和播放器一样用普通 GET，只看前 64 字节，立刻断开 */
      const req = lib.get(u, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0', Accept: '*/*' },
        timeout: Math.max(3000, timeout - 1500),
      }, (res) => {
        if (res.statusCode >= 400 && res.statusCode !== 206) { res.resume(); return done(false) }
        let judged = false
        res.on('data', (chunk) => {
          if (judged) return
          judged = true
          const head = chunk.slice(0, 64).toString('latin1').trim()
          try { res.destroy() } catch (e) { }
          if (!head) return done(false)
          if (/^[{[]/.test(head)) return done(false)
          if (/^<(!doctype|html|\\?xml)/i.test(head)) return done(false)
          done(true)
        })
        res.on('end', () => { if (!judged) done(false) })
        res.on('error', () => { if (!judged) done(true) })
      })
      req.on('error', () => done(true))
      req.on('timeout', () => { try { req.destroy() } catch (e) { } done(true) })
    } catch (e) { done(false) }
  })
}`

  s = s.slice(0, pStart) + impl + s.slice(pEnd)
  fs.writeFileSync(sp, s, 'utf8')
  console.log('probeUrl 已改为 GET 嗅探')
}

/* ---------- 2) proxyStream 去掉拦截 ---------- */
const sv = 'app/server.js'
let v = fs.readFileSync(sv, 'utf8')
const oldBlock = `    /* 上游回的是网页而不是音频 → 直接报错，别把 HTML 当歌存下来 */
    const upType = String(up.headers['content-type'] || '').toLowerCase()
    if (upType.includes('text/html') || upType.includes('application/json')) {
      up.resume()
      return json(res, 502, { error: '该音频地址已失效（返回了网页/错误信息）' })
    }`
if (v.includes(oldBlock)) {
  v = v.replace(oldBlock, `    const upType = String(up.headers['content-type'] || '').toLowerCase()`)
  fs.writeFileSync(sv, v, 'utf8')
  console.log('proxyStream 拦截已移除')
} else {
  console.log('proxyStream 拦截块未匹配')
}
