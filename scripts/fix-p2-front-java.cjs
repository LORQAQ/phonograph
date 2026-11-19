'use strict'
/* 第 5 批：前端 B51/B10 + Java B83/B84/B90 */
const path = require('node:path')
process.chdir(path.resolve(__dirname, '..'))
const fs = require('node:fs')
const done = []
const miss = []

/* ================= 前端 B51: qqCookie 不在输入框回显 ============ */
{
  const p = 'public/app.js'
  let s = fs.readFileSync(p, 'utf8')
  const old = `if (inp && s && s.qqCookie) inp.value = s.qqCookie`
  if (s.includes(old)) {
    s = s.replace(old, `/* B51: 服务端脱敏后不再返回 qqCookie，改成提示「已保存」；
       输入框留空 = 不修改，避免用户一点保存就把真 Cookie 洗掉 */
    if (inp) {
      inp.value = ''
      inp.placeholder = (s && s.qqCookieSet)
        ? ('已保存（尾号 ' + (s.qqCookieTail || '') + '，留空则不修改）')
        : '粘贴浏览器 Cookie'
    }`)
    done.push('B51 qqCookie 不回显 + placehoder 提示')
  } else {
    const i = s.indexOf('qqCookie')
    if (i > 0) console.log('  B51 现场:\n' + s.slice(Math.max(0, i - 300), i + 300))
    else miss.push('B51 qqCookie')
  }

  /* 保存时：空字符串不提交 */
  const saveOld = `body: { qqCookie: v }`
  if (s.includes(saveOld)) {
    s = s.replace(saveOld, `body: v ? { qqCookie: v } : {}    /* B51: 空串不提交 */`)
    done.push('B51 保存时空串不提交')
  } else {
    const i = s.indexOf("api('/api/settings'")
    if (i > 0) console.log('  B51 保存现场:\n' + s.slice(Math.max(0, i - 200), i + 300))
  }

  /* ================= 前端 B10: 清空数据时先掐断队列 ============ */
  const rdOld = `    if (!window.confirm('清空全部歌单与本地缓存？此操作不可恢复')) return`
  if (s.includes(rdOld)) {
    s = s.replace(rdOld, `    if (!window.confirm('清空全部歌单与本地缓存？此操作不可恢复')) return
      /* B10: 先掐断队列，否则 beforeunload → saveQueue 会把 lx.queue 原样写回去 */
      try {
        ++state.playToken
        state.queue = []
        state.index = -1
        state.currentSong = null
        state.playing = false
        try { audio.pause() } catch (e) { }
        try { audio.removeAttribute('src'); audio.load() } catch (e) { }
        if (typeof saveQueue === 'function') saveQueue()
      } catch (e) { }`)
    done.push('B10 清空前掐断队列')
  } else {
    miss.push('B10 btnResetData')
  }

  fs.writeFileSync(p, s, 'utf8')
}

/* ================= Java B83: 下载单独线程池 ============ */
{
  const p = 'apk-build/app/src/com/phonograph/player/NapiBridge.java'
  const full = path.resolve(process.cwd(), '..', p)
  let s = fs.readFileSync(full, 'utf8')

  if (!s.includes('__DL_POOL')) {
    const anchor = 'private static final java.util.concurrent.ExecutorService __HTTP_POOL ='
    if (s.includes(anchor)) {
      const lineEnd = s.indexOf(';', s.indexOf('newFixedThreadPool(6)')) + 1
      s = s.slice(0, lineEnd) + `
    /* B83: 下载单独一个单线程池，别和普通 HTTP 抢 */
    private static final java.util.concurrent.ExecutorService __DL_POOL =
            java.util.concurrent.Executors.newSingleThreadExecutor();` + s.slice(lineEnd)
      done.push('B83 注入下载专用池')
    }
  }

  /* 把 download 里的 __HTTP_POOL.execute 换成 __DL_POOL */
  const dlIdx = s.indexOf('public void download(')
  if (dlIdx > 0) {
    const seg = s.slice(dlIdx, dlIdx + 3000)
    if (seg.includes('__HTTP_POOL.execute')) {
      const fixed = seg.replace(/__HTTP_POOL\.execute/g, '__DL_POOL.execute')
      s = s.slice(0, dlIdx) + fixed + s.slice(dlIdx + 3000)
      done.push('B83 download 改用 __DL_POOL')
    }
  }

  /* ================= Java B84: fileName 空值保护 ============ */
  const fnOld = `    private void doDownload(`
  /* 找 doDownload 内部第一行加保护 */
  const di = s.indexOf('doDownload(')
  if (di > 0 && !s.includes('audio_ + System.currentTimeMillis()')) {
    const bs = s.indexOf('{', s.indexOf(')', di))
    s = s.slice(0, bs + 1) + `
        /* B84: fileName 为 null 时后面的 fileName.toLowerCase() 会 NPE，被 catch 吞掉 →
           文件被存成字面量 null 且扩展名修正失效 */
        if (fileName == null || fileName.trim().isEmpty()) {
            fileName = "audio_" + System.currentTimeMillis() + ".mp3";
        }` + s.slice(bs + 1)
    done.push('B84 fileName 空值保护')
  }

  /* ================= Java B90: lyricShow 返回 boolean ============ */
  const lyOld = `public void lyricShow(String text, String next) {`
  if (s.includes(lyOld)) {
    s = s.replace(lyOld, `public boolean lyricShow(String text, String next) {`)
    /* 找方法体里的调用 */
    const li = s.indexOf('public boolean lyricShow(')
    const lbe = s.indexOf('{', li)
    const lend = s.indexOf('\n    }', lbe)
    if (lend > 0) {
      let body = s.slice(lbe, lend)
      body = body.replace(/if \(lyric != null\) lyric\.show\(text, next\);/,
        'if (lyric == null) return false;\n        return lyric.show(text, next);    /* B90: 把真实结果传回 JS */')
      s = s.slice(0, lbe) + body + s.slice(lend)
      done.push('B90 lyricShow 返回 boolean')
    }
  }

  fs.writeFileSync(full, s, 'utf8')
}

console.log('=== 已完成 ===')
done.forEach((d) => console.log('  ✓ ' + d))
if (miss.length) {
  console.log('=== 未匹配 ===')
  miss.forEach((m) => console.log('  ⚠ ' + m))
}
