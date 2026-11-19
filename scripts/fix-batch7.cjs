'use strict'
/* 第 7 批：B11/B60 歌词滚动 + B18/B19 手机端缓存与竞态 + B29 fish 的 only/disabled + B73/B75/B76/B77/B78/B79 */
process.chdir(require('node:path').resolve(__dirname, '..'))

const fs = require('node:fs')
const done = []
const miss = []

/* ================= public/app.js: B11/B60 歌词滚动 ================= */
{
  const p = 'public/app.js'
  let s = fs.readFileSync(p, 'utf8')

  const marker = "$('#lyricInner').style.transform"
  const mi = s.indexOf(marker)
  if (mi > 0 && !s.includes('__staticFlow')) {
    /* 找语句起点（行首） */
    let ls = mi
    while (ls > 0 && s[ls - 1] !== '\n') ls--
    /* 找语句终点（该行末尾） */
    let le = s.indexOf('\n', mi)
    if (le < 0) le = s.length

    const origLine = s.slice(ls, le)
    const inject = `    /* B11/B60: 移动端 CSS 把 .lyric-inner 设成 position:static + transform:none !important，
       JS 的 translateY 被压掉 → 歌词不跟随。static 布局下改用滚动容器的 scrollTop。 */
    {
      const __sc = $('#lyricScroll')
      const __inner = $('#lyricInner')
      const __staticFlow = __inner && window.getComputedStyle(__inner).position === 'static'
      const __line = lines[idx]
      if (__staticFlow && __sc && __line) {
        const __t = __line.offsetTop - __sc.clientHeight / 2 + __line.clientHeight / 2
        try { __sc.scrollTo({ top: Math.max(0, __t), behavior: 'smooth' }) } catch (e) { __sc.scrollTop = Math.max(0, __t) }
      } else {
${origLine}
      }
    }`
    s = s.slice(0, ls) + inject + s.slice(le)
    fs.writeFileSync(p, s, 'utf8')
    done.push('B11/B60 歌词滚动兼容 static 布局')
  } else {
    miss.push('B11 lyricInner transform')
  }
}

/* ================= mobile/www/api-mobile.js: B18 缓存 + B19 竞态 ================= */
{
  const p = 'mobile/www/api-mobile.js'
  let s = fs.readFileSync(p, 'utf8')

  /* B18: /api/url 加 in-flight + 短 TTL 缓存 */
  if (!s.includes('__urlCache') && s.includes("if (p === '/api/url')")) {
    const anchor = "    if (p === '/api/url') {"
    const helper = `    /* B18: 手机端 /api/url 完全没有缓存，每次播放都跑一遍 fish×3 + 5 源竞速；
       同一首歌播放时前端还会并发打两次。这里加 in-flight 合并 + 短 TTL。 */
    if (p === '/api/url') {
      const __uKey = [q.get('id'), q.get('source') || 'wy', q.get('quality') || '320k', q.get('only') || ''].join('|')
      const __now = Date.now()
      if (!window.__urlCache) window.__urlCache = new Map()
      if (!window.__urlInflight) window.__urlInflight = new Map()
      const __hit = window.__urlCache.get(__uKey)
      if (__hit && __hit.exp > __now) return __hit.value
      if (window.__urlInflight.has(__uKey)) return window.__urlInflight.get(__uKey)
      const __job = (async () => {`
    s = s.replace(anchor, helper)

    /* 在该分支结尾插入 finally */
    const startIdx = s.indexOf(helper)
    /* 找该分支的 return 语句 */
    const retIdx = s.indexOf("return { id, source, url: r.url", startIdx)
    if (retIdx > 0) {
      const le = s.indexOf('\n', retIdx)
      s = s.slice(0, le + 1) + `      })().then((__r) => {
        if (__r && __r.url) window.__urlCache.set(__uKey, { value: __r, exp: Date.now() + 4 * 60e3 })
        return __r
      }).finally(() => window.__urlInflight.delete(__uKey))
      window.__urlInflight.set(__uKey, __job)
      return __job
` + s.slice(le + 1)
      done.push('B18 手机端 /api/url in-flight + 缓存')
    } else {
      miss.push('B18 /api/url 返回点')
    }
  }

  /* B19: 导入歌单 await 之后重新取 db */
  const b19old = `        const d0 = db()`
  if (s.includes(b19old) && s.includes('importPlaylistMobile')) {
    /* 找 import 分支里的 saveDb 前 */
    const i = s.indexOf("action0 === 'import'")
    if (i > 0) {
      const seg = s.slice(i, i + 2500)
      const pushIdx = seg.indexOf('d0.playlists.push(pl)')
      if (pushIdx > 0) {
        const abs = i + pushIdx
        s = s.slice(0, abs) + `/* B19: await 期间用户可能新建了歌单，重新取一次再写，避免整份覆盖 */
        const __d1 = db()
        if (!Array.isArray(__d1.playlists)) __d1.playlists = []
        __d1.playlists.push(pl)
        saveDb(__d1)
        return { playlists: __d1.playlists, imported: { id: pl.id, name: pl.name, count: songs.length, platform: r0.platform } }
` + s.slice(abs)
        /* 删掉后面原来的 push/saveDb/return（三行） */
        const delStart = s.indexOf('d0.playlists.push(pl)', abs + 100)
        if (delStart > 0) {
          const delEnd = s.indexOf('}', s.indexOf('imported:', delStart))
          /* 保守：只删 push + saveDb 两行 */
          const l1 = s.lastIndexOf('\n', delStart) + 1
          const l2 = s.indexOf('\n', s.indexOf('saveDb(d0)', delStart)) + 1
          s = s.slice(0, l1) + s.slice(l2)
        }
        done.push('B19 导入歌单写前重读')
      }
    }
  }

  fs.writeFileSync(p, s, 'utf8')
}

/* ================= mobile/www/api-mobile.js: B73 / B75 / B74 已修 ================= */
{
  const p = 'mobile/www/api-mobile.js'
  let s = fs.readFileSync(p, 'utf8')

  /* B73: /api/sources 首次加载前先 ensure */
  const b73old = `    if (p === '/api/sources') {`
  if (s.includes(b73old) && !s.includes('await ensureScripts()')) {
    s = s.replace(b73old, `    if (p === '/api/sources') {
      /* B73: 冷启动直接进设置→音源时显示 0/0，这里先确保脚本已加载 */
      try { if (typeof ensureScripts === 'function') await ensureScripts() } catch (e) { }`)
    done.push('B73 /api/sources 先 ensureScripts')
  }

  /* B75: /api/discover 补 newSongs */
  const b75 = `newSongs: []`
  if (s.includes(b75)) {
    s = s.split(b75).join('newSongs: (source === \'wy\' && NET_WY.newSongs) ? await NET_WY.newSongs(10).catch(() => []) : []')
    done.push('B75 /api/discover 补 newSongs')
  }

  fs.writeFileSync(p, s, 'utf8')
}

/* ================= mobile/www/lib/lx-engine-web.js: B29 / B76 / B77 ================= */
{
  const p = 'mobile/www/lib/lx-engine-web.js'
  let s = fs.readFileSync(p, 'utf8')

  /* B29: fish 尊重 only / disabled */
  const b29old = `const fishScript = this.scripts.get('fish')`
  if (s.includes(b29old)) {
    s = s.replace(b29old, `/* B29: fish 之前无视 only 与 disabled，禁用后照跑、指定只用某源也返回 fish */
      const __fishOk = (!only || only === 'fish') && !(this.disabled && this.disabled.has && this.disabled.has('fish'))
      const fishScript = __fishOk ? this.scripts.get('fish') : null`)
    done.push('B29 fish 尊重 only/disabled')
  } else {
    const i = s.indexOf("this.scripts.get('fish')")
    if (i > 0) console.log('  B29 现场:\n' + s.slice(i - 200, i + 200))
    else miss.push('B29 fish')
  }

  /* B76: 音源日志接到 logs 数组 */
  if (s.includes('this.logs = []') && !s.includes('__pushLog')) {
    const anchor = 'this.logs = []'
    s = s.replace(anchor, `this.logs = []
    this.__pushLog = (lvl) => (...a) => {
      try {
        const line = '[' + lvl + '] ' + a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')
        this.logs.push({ level: lvl, line: line.slice(0, 400), ts: Date.now() })
        if (this.logs.length > 200) this.logs.shift()
      } catch (e) { }
    }`)
    done.push('B76 音源日志收集器')
  }

  /* B77: globalThis.lx 与 Buffer 在 finally 里还原 */
  if (s.includes('globalThis.Buffer = Buf') && !s.includes('__prevBuffer')) {
    s = s.replace('globalThis.Buffer = Buf', `const __prevBuffer = globalThis.Buffer
      globalThis.Buffer = Buf`)
    done.push('B77 记录 prevBuffer')
  }

  fs.writeFileSync(p, s, 'utf8')
}

/* ================= mobile/www/lib/native-http.js: B78 / B79 ================= */
{
  const p = 'mobile/www/lib/native-http.js'
  let s = fs.readFileSync(p, 'utf8')

  /* B78: opts.timeout */
  if (s.includes('25000') && !s.includes('opts.timeout')) {
    s = s.replace(/}, 25000\)/, `}, Math.max(1500, Math.min(60000, Number(opts.timeout) || 25000)))`)
    done.push('B78 尊重 opts.timeout')
  }

  /* B79: 会话前缀 */
  if (!s.includes('__HTTP_SESSION')) {
    const anchor = 'let seq = 0'
    if (s.includes(anchor)) {
      s = s.replace(anchor, `let seq = 0
  /* B79: 页面重载后 seq 从 1 重来，旧页面的残留响应会串进新请求。加会话前缀丢弃。 */
  const __HTTP_SESSION = Date.now().toString(36) + Math.random().toString(36).slice(2, 8)`)
      s = s.replace(`const id = String(++seq)`, `const id = __HTTP_SESSION + ':' + (++seq)`)
      done.push('B79 回调 ID 会话前缀')
    }
  }

  fs.writeFileSync(p, s, 'utf8')
}

console.log('=== 已完成 ===')
done.forEach((d) => console.log('  ✓ ' + d))
if (miss.length) {
  console.log('=== 未匹配 ===')
  miss.forEach((m) => console.log('  ⚠ ' + m))
}
