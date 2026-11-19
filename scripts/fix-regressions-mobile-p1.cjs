'use strict'
/* 修第三轮移动端审查的 P1/P2 */
const path = require('node:path')
process.chdir(path.resolve(__dirname, '..'))
const fs = require('node:fs')
const done = []
const miss = []

/* ================= P1-A: B18 缓存 key 补字段 + 返回拷贝 + 支持 force ================= */
{
  const p = 'mobile/www/api-mobile.js'
  let s = fs.readFileSync(p, 'utf8')

  const oldKey = `      key = [q.get('id'), q.get('source') || 'wy', q.get('quality') || '320k', q.get('only') || ''].join('|')`
  if (s.includes(oldKey)) {
    s = s.replace(oldKey, `      /* 缓存 key 必须包含所有参与取流的参数。
         只取 4 个字段会出两个 bug：
         1) format 没进 key → 播放缓存的 mp3 直链会被 FLAC 下载命中（下到 mp3 但文件名 .flac）
         2) mediaMid/name/singer 没进 key → QQ 同 songmid 不同文件、跨平台兜底搜词不同也会被合并 */
      key = [
        q.get('id'), q.get('source') || 'wy', q.get('quality') || '320k',
        q.get('format') || '', q.get('only') || '',
        q.get('mediaMid') || '', q.get('name') || '', q.get('singer') || '',
      ].join('|')`)
    done.push('P1-A B18 key 补 format/mediaMid/name/singer')
  } else {
    miss.push('B18 key')
  }

  /* 返回浅拷贝，避免调用方改写污染缓存 */
  const oldRet = `    const hit = __urlCache.get(key)
    if (hit && hit.exp > Date.now()) return Promise.resolve(hit.value)`
  if (s.includes(oldRet)) {
    s = s.replace(oldRet, `    /* force / noCache：失败重试时必须能绕过缓存 */
    const __force = !!(opts && (opts.force || opts.noCache))
    if (!__force) {
      const hit = __urlCache.get(key)
      if (hit && hit.exp > Date.now()) {
        /* 返回浅拷贝：调用方改 d.url 不会污染全局缓存 */
        return Promise.resolve(Object.assign({}, hit.value))
      }
    }
    if (__force) { __urlCache.delete(key); __urlInflight.delete(key) }`)
    done.push('P1-A B18 支持 force + 返回拷贝')
  } else {
    const i = s.indexOf('const hit = __urlCache.get(key)')
    if (i > 0) console.log('  B18 hit 现场:\n' + s.slice(i - 100, i + 200))
    else miss.push('B18 hit')
  }

  fs.writeFileSync(p, s, 'utf8')
}

/* ================= P1-B: B29 only / disabled 在竞速路径也生效 ================= */
{
  const p = 'mobile/www/lib/lx-engine-web.js'
  let s = fs.readFileSync(p, 'utf8')

  /* 找 want 的构造 */
  const m = s.match(/const want = only \? \[only\]\.concat\([^)]*\)[^\n]*/)
  if (m) {
    console.log('  B29 want 现场: ' + m[0].slice(0, 140))
    s = s.replace(m[0], `/* P1-B: only 指定时必须只试它，不能把其余音源也塞进竞速列表 */
      const want = only ? [only] : order`)
    done.push('P1-B B29 want 只含 only')
  } else {
    const i = s.indexOf('const want =')
    if (i > 0) console.log('  B29 want 形态:\n' + s.slice(i, i + 260))
    else miss.push('B29 want')
  }

  /* 找 list 的构造，去掉「回退到全部脚本」 */
  const listOld = `      const list = want.filter((id) => !isDisabled(id)).map((id) => this.scripts.get(id)).filter(Boolean)`
  if (s.includes(listOld)) {
    s = s.replace(listOld, `      /* P1-B: 不回退到「全部脚本」。only 指定的源不可用就应该明确失败，
         交给上层跨平台兜底，而不是静默换源假装成功。 */
      const list = want.map((id) => this.scripts.get(id)).filter((e) => e && !isDisabled(e.id))`)
    done.push('P1-B B29 list 不过滤回退')
  } else {
    const i = s.indexOf('const list = want')
    if (i > 0) console.log('  B29 list 形态:\n' + s.slice(i, i + 260))
    else miss.push('B29 list')
  }

  /* 找 if (!list.length) 之后的回退 */
  const fbOld = `      if (!list.length) {`
  if (s.includes(fbOld)) {
    /* 看它后面是不是把 list 换成全部 */
    const idx = s.indexOf(fbOld)
    const seg = s.slice(idx, idx + 400)
    if (seg.includes('Array.from(this.scripts.values())') || seg.includes('this.scripts.values()')) {
      console.log('  B29 有「回退到全部脚本」分支，需要删除')
      /* 找到该 if 块并替换为 return null */
      const bs = s.indexOf('{', idx)
      let d = 0, e = bs
      for (let k = bs; k < s.length; k++) {
        if (s[k] === '{') d++
        else if (s[k] === '}') { d--; if (d === 0) { e = k + 1; break } }
      }
      s = s.slice(0, idx) + `      if (!list.length) {
        /* P1-B: 没有可用音源时明确返回 null，别偷偷换成全部脚本 */
        return null
      }` + s.slice(e)
      done.push('P1-B B29 删除回退分支')
    }
  }

  fs.writeFileSync(p, s, 'utf8')
}

/* ================= P1-C: B80 代理没起来不要静默直连 ================= */
{
  const p = 'apk-build/app/src/com/phonograph/player/NapiBridge.java'
  const full = path.resolve(process.cwd(), '..', p)
  if (fs.existsSync(full)) {
    let s = fs.readFileSync(full, 'utf8')
    const old = `        int port = LocalProxy.getPort();
        if (port <= 0 || url == null || url.length() < 8) return url;`
    if (s.includes(old)) {
      s = s.replace(old, `        int port = LocalProxy.getPort();
        /* P1-C: 代理没起来时不要静默回退直连 —— 直连发不出 Referer，
           酷狗/QQ 的防盗链地址必然 403，用户看到的是「能搜到、点播放必失败」。
           这里先尝试自愈，还不行就返回空串让前端提示。 */
        if (port <= 0) {
            try { LocalProxy.start(); } catch (Throwable ignore) { }
            port = LocalProxy.getPort();
        }
        if (port <= 0) return "";
        if (url == null || url.length() < 8) return url;`)
      fs.writeFileSync(full, s, 'utf8')
      done.push('P1-C B80 代理未就绪时自愈 + 不再静默直连')
    } else {
      miss.push('B80 proxyUrl')
    }
  } else {
    miss.push('NapiBridge.java 路径')
  }
}

/* ================= P2: B73 /api/sources 真的 await ensureScripts ================= */
{
  const p = 'mobile/www/api-mobile.js'
  let s = fs.readFileSync(p, 'utf8')
  const old = `    if (p === '/api/sources') {
      /* B73: 冷启动直接进设置→音源时显示 0/0，这里先确保脚本已加载 */
      try { if (typeof ensureScripts === 'function') await ensureScripts() } catch (e) { }`
  if (s.includes(old)) {
    done.push('B73 已存在（确认）')
  } else {
    const i = s.indexOf("if (p === '/api/sources')")
    if (i > 0) {
      const seg = s.slice(i, i + 300)
      console.log('  B73 现场:\n' + seg)
    }
  }
}

/* ================= P2: B76 日志接到脚本 console ================= */
{
  const p = 'mobile/www/lib/lx-engine-web.js'
  let s = fs.readFileSync(p, 'utf8')
  if (!s.includes('__prevConsole')) {
    /* 在 new Function 执行前后替换 console */
    const anchor = 'fn.call(globalThis)'
    if (s.includes(anchor) && s.includes('__pushLog')) {
      s = s.replace(anchor, `/* P2: 把脚本的 console 接到实例的 logs 数组，否则音源面板的「日志」永远空白 */
      const __prevConsole = globalThis.console
      try {
        if (this.__pushLog) {
          globalThis.console = {
            log: this.__pushLog('log'),
            info: this.__pushLog('info'),
            warn: this.__pushLog('warn'),
            error: this.__pushLog('error'),
            debug: this.__pushLog('debug'),
          }
        }
      } catch (e) { }
      try {
        fn.call(globalThis)
      } finally {
        try { globalThis.console = __prevConsole } catch (e) { }
      }`)
      done.push('P2 B76 脚本 console 接日志')
    } else {
      miss.push('B76 fn.call 锚点')
    }
  } else {
    done.push('B76 已接（确认）')
  }
  fs.writeFileSync(p, s, 'utf8')
}

/* ================= P2: B77 Buffer/atob/btoa 还原 ================= */
{
  const p = 'mobile/www/lib/lx-engine-web.js'
  let s = fs.readFileSync(p, 'utf8')
  if (s.includes('__prevBuffer') && !s.includes('globalThis.Buffer = __prevBuffer')) {
    /* 找 setTimeout 里的 lx 还原，把 Buffer 也加上 */
    const anchor = 'globalThis.lx = prevLx'
    const cnt = (s.match(/globalThis\.lx = prevLx/g) || []).length
    if (cnt > 0) {
      s = s.replace(/globalThis\.lx = prevLx/g, `globalThis.lx = prevLx
        try { if (typeof __prevBuffer !== 'undefined') globalThis.Buffer = __prevBuffer } catch (e) { }`)
      done.push('P2 B77 Buffer 还原')
    }
  } else if (s.includes('globalThis.Buffer = __prevBuffer')) {
    done.push('B77 已还原（确认）')
  }
  fs.writeFileSync(p, s, 'utf8')
}

console.log('=== 已完成 ===')
done.forEach((d) => console.log('  ✓ ' + d))
if (miss.length) {
  console.log('=== 未匹配（需手工）===')
  miss.forEach((m) => console.log('  ⚠ ' + m))
}
