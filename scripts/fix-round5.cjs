'use strict'
/* 第五轮：修 audit4 报告里剩下的 P2/P3 */
const path = require('node:path')
process.chdir(path.resolve(__dirname, '..'))
const fs = require('node:fs')
const J = (o) => JSON.stringify(o)
const done = []
const miss = []

/* ================= 前端 ================= */
{
  const p = 'public/app.js'
  let s = fs.readFileSync(p, 'utf8')

  /* ---- 1. api() 加超时 ---- */
  const apiOld = `async function api (path, opts = {}) {`
  if (s.includes(apiOld) && !s.includes('opts.timeoutMs')) {
    /* 找 api 函数体开头，看它怎么调 fetch */
    const i = s.indexOf(apiOld)
    const bs = s.indexOf('{', i)
    s = s.slice(0, bs + 1) + `
  /* P2-9: 原来没有超时，服务端卡住（比如 gcid 拖 120 秒）界面就永远转圈 */
  const __ac = new AbortController()
  const __to = setTimeout(() => { try { __ac.abort() } catch (e) { } }, opts.timeoutMs || 45000)
  try {` + s.slice(bs + 1)

    /* 找 return 之前的 fetch，加 signal；并在函数末尾 finally 清定时器 */
    const bodyStart = bs + 1
    /* 找函数结束 */
    let d = 1
    let e = bodyStart + 1
    for (let k = bodyStart + 1; k < s.length; k++) {
      if (s[k] === '{') d++
      else if (s[k] === '}') { d--; if (d === 0) { e = k; break } }
    }
    let body = s.slice(bodyStart, e)
    /* fetch( -> fetch(... signal */
    body = body.replace(/fetch\(([\s\S]{0,200}?)\)(\s*\.then|\s*$)/m, (m, args, tail) => {
      if (args.includes('signal')) return m
      return 'fetch(' + args + ', { signal: __ac.signal })' + tail
    })
    /* 在函数结尾加 finally */
    body = body + '} finally { clearTimeout(__to) }'
    s = s.slice(0, bodyStart) + body + s.slice(e)
    done.push('前端 api() 加 45 秒超时')
  }

  /* ---- 2. 切音质时让全局 onAudioError 让路 ---- */
  const bindOld = `audio.addEventListener('error', onAudioError)`
  if (s.includes(bindOld)) {
    s = s.replace(bindOld, `/* P1-2: 切音质期间让全局的 onAudioError 让路，
       否则两个 handler 会抢着改 audio.src —— 一个回退、一个换源重试、还可能 playNext */
    audio.addEventListener('error', (e) => {
      if (state.__qualitySwitching) return
      onAudioError(e)
    })`)
    done.push('切音质期间 onAudioError 让路')
  }

  /* reloadCurrent 设标志 */
  const rcOld = `async function reloadCurrent (prevQualityArg) {`
  if (s.includes(rcOld) && !s.includes('__qualitySwitching = true')) {
    s = s.replace(rcOld, `async function reloadCurrent (prevQualityArg) {
  state.__qualitySwitching = true`) 
    done.push('reloadCurrent 设 __qualitySwitching')
  }

  /* 四条出口都清标志：onErr / onOk / fallback / 超时 */
  const clearCount = (s.match(/state\.__qualitySwitching = false/g) || []).length
  if (clearCount === 0) {
    /* 在 reloadCurrent 的 finally 或每个 return 前加 */
    const idx = s.indexOf('async function reloadCurrent')
    const bs2 = s.indexOf('{', idx)
    let d2 = 1
    let e2 = bs2 + 1
    for (let k = bs2 + 1; k < s.length; k++) {
      if (s[k] === '{') d2++
      else if (s[k] === '}') { d2--; if (d2 === 0) { e2 = k; break } }
    }
    const body = s.slice(bs2, e2)
    const newBody = body.replace(/\n(\s*)return\b/g, (m, sp) => `\n${sp}state.__qualitySwitching = false\n${sp}return`)
    s = s.slice(0, bs2) + newBody + s.slice(e2)
    done.push('reloadCurrent 每个 return 前清标志')
  }

  /* ---- 3. setSrc 目标不存在：真的加一个 #srcBadge ---- */
  /* 先看 index.html 有没有 */
  const htmlPath = 'public/index.html'
  let h = fs.readFileSync(htmlPath, 'utf8')
  if (!h.includes('id="srcBadge"')) {
    /* 找 np-meta 或 np-singer 附近插入 */
    const npSinger = h.indexOf('id="npSinger"')
    if (npSinger > 0) {
      const closeTag = h.indexOf('</', npSinger)
      const lineEnd = h.indexOf('\n', npSinger)
      h = h.slice(0, lineEnd + 1) + '          <span id="srcBadge" class="src-badge"></span>\n' + h.slice(lineEnd + 1)
      fs.writeFileSync(htmlPath, h, 'utf8')
      done.push('#srcBadge 补进 index.html')
    } else {
      miss.push('#npSinger 锚点')
    }
  } else {
    done.push('#srcBadge 已存在')
  }

  fs.writeFileSync(p, s, 'utf8')
}

/* ================= 手机端 ================= */
{
  const p = 'mobile/www/api-mobile.js'
  let s = fs.readFileSync(p, 'utf8')

  /* ---- 4. 移动端设置里切音质要重载 ---- */
  /* 这个在 app.js 里，稍后处理 */

  /* ---- 5. truncated 让前端能显示 ---- */
  const impOld = `return { platform: 'kg', name: r.name || '酷狗歌单', cover: r.cover || '', songs: r.songs }`
  if (s.includes(impOld)) {
    s = s.replace(impOld, `return {
          platform: 'kg',
          name: r.name || '酷狗歌单',
          cover: r.cover || '',
          songs: r.songs,
          total: r.total,
          truncated: !!r.truncated,
        }`)
    done.push('手机端 truncated 透传（第二处）')
  }

  /* ---- 6. __kgReq 超时与 Java 对齐 ---- */
  const toOld = `    timeout: 20000,
  })`
  if (s.includes(toOld)) {
    s = s.replace(toOld, `    timeout: 40000,   /* M11: Java 侧 connect 12s + read 20s = 32s，JS 超时不能短于它 */
  })`)
    done.push('__kgReq 超时 20s → 40s')
  }

  fs.writeFileSync(p, s, 'utf8')
}

/* ================= 服务端 ================= */
{
  const p = 'app/server.js'
  let s = fs.readFileSync(p, 'utf8')

  /* ---- 7. 错误码不要拿字符串当 HTTP status ---- */
  const errOld = `  } catch (e) {
    if (!res.headersSent) json(res, e.code || 500, { error: e.message || '服务器内部错误', attempts: e.attempts || undefined })`
  if (s.includes(errOld)) {
    s = s.replace(errOld, `  } catch (e) {
    /* P2-1: socket 类错误的 code 是字符串（ECONNRESET/ETIMEDOUT），
       直接传给 writeHead 会抛 Invalid status code，响应永远发不出去 */
    const __n = Number(e && e.code)
    const __code = (Number.isInteger(__n) && __n >= 400 && __n <= 599) ? __n : 500
    if (!res.headersSent) json(res, __code, { error: e.message || '服务器内部错误', attempts: e.attempts || undefined })`)
    done.push('错误码不再当 HTTP status')
  } else {
    const i = s.indexOf('e.code || 500')
    if (i > 0) {
      s = s.replace('json(res, e.code || 500,', 'json(res, (function(){const n=Number(e&&e.code);return (Number.isInteger(n)&&n>=400&&n<=599)?n:500})(),')
      done.push('错误码不再当 HTTP status（宽松匹配）')
    } else {
      miss.push('错误码处理')
    }
  }

  /* ---- 8. /api/download 进写名单（save=1 会落盘） ---- */
  if (!s.includes("'/api/download'")) {
    const anchor = `        '/api/downloads/remove',`
    if (s.includes(anchor)) {
      s = s.replace(anchor, `${anchor}
        '/api/download',`)
      done.push('/api/download 进写名单')
    }
  } else {
    done.push('/api/download 已在写名单')
  }

  /* ---- 9. flushDb 指数退避 ---- */
  const fdOld = `    if (!saveTimer) saveTimer = setTimeout(flushDb, 3000)`
  if (s.includes(fdOld)) {
    s = s.replace(fdOld, `    /* P3-6: 指数退避，别每 3 秒刷日志 */
    dbRetry = Math.min((dbRetry || 0) + 1, 6)
    const __delay = Math.min(60000, 1000 * Math.pow(2, dbRetry))
    if (dbRetry <= 2) console.error('[db] 写盘失败，' + Math.round(__delay / 1000) + 's 后重试:', e.message)
    if (!saveTimer) saveTimer = setTimeout(flushDb, __delay)`)

    /* 成功分支重置 */
    const okOld = `    dbDirty = false
    dbFirstDirtyAt = 0`
    if (s.includes(okOld)) {
      s = s.replace(okOld, `    dbDirty = false
    dbFirstDirtyAt = 0
    dbRetry = 0`)
    }
    done.push('flushDb 指数退避')
  }

  /* ---- 10. B51 支持显式清空 Cookie ---- */
  const ckOld = `      if (patch.qqCookie === undefined || patch.qqCookie === '' || patch.qqCookie === null) {
        delete patch.qqCookie
      }`
  if (s.includes(ckOld)) {
    s = s.replace(ckOld, `      /* P3-5: 显式清空用 clearQqCookie，空串仍然表示「不修改」 */
      if (patch.clearQqCookie === true) {
        patch.qqCookie = ''
      } else if (patch.qqCookie === undefined || patch.qqCookie === '' || patch.qqCookie === null) {
        delete patch.qqCookie
      }
      delete patch.clearQqCookie`)
    done.push('B51 支持显式清空 Cookie')
  }

  fs.writeFileSync(p, s, 'utf8')
}

console.log('=== 已完成 ===')
done.forEach((d) => console.log('  ✓ ' + d))
if (miss.length) {
  console.log('=== 未匹配 ===')
  miss.forEach((m) => console.log('  ⚠ ' + m))
}
