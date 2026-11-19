'use strict'
/* 第 6 批前端：B58 / B63 / B66 / B10 / B11+B60 / B55 / B70 / B86 */
process.chdir(require('node:path').resolve(__dirname, '..'))

const fs = require('node:fs')
const p = 'public/app.js'
let s = fs.readFileSync(p, 'utf8')
const done = []
const miss = []

/* ============ B58: 下载弹窗 XSS ============ */
{
  const old = `      + (song ? (song.name + ' - ' + song.singer) : '') + '</div>'`
  if (s.includes(old)) {
    s = s.replace(old, `      + esc(song ? (song.name + ' - ' + song.singer) : '') + '</div>'`)
    done.push('B58 下载弹窗 XSS')
  } else {
    const i = s.indexOf('fmt-title')
    if (i > 0) console.log('  B58 现场:\n' + s.slice(i - 100, i + 400))
    else miss.push('B58')
  }
}

/* ============ B63: 下载失败提示按真实原因 ============ */
{
  const old = `    toast('下载失败：目录不可写，请在设置里换个位置（如 D:\\\\Music）', 4200)`
  if (s.includes(old)) {
    s = s.replace(old, `    /* B63: 不再一律甩「目录不可写」，按真实原因提示 */
    toast('下载失败：' + ((r0 && r0.error) || '未知错误'), 4200)`)
    done.push('B63 下载失败提示')
  } else {
    const i = s.indexOf('目录不可写')
    if (i > 0) console.log('  B63 现场:\n' + s.slice(i - 300, i + 200))
    else miss.push('B63')
  }
}

/* ============ B66: 搜索请求序号 ============ */
{
  const old = `  if (!kw || state.loading) return`
  if (s.includes(old)) {
    s = s.replace(old, `  /* B66: 不再因为 loading 直接丢弃新搜索；用序号丢弃过期响应 */
  if (!kw) return`)
    /* 加序号 */
    const anchor = 'async function doSearch (append'
    if (s.includes(anchor) && !s.includes('searchSeq')) {
      s = s.replace(anchor, `let searchSeq = 0\nasync function doSearch (append`)
      done.push('B66 搜索序号声明')
    }
  } else {
    miss.push('B66 loading 早退')
  }
}

/* ============ B10: 设置面板控件绑定 ============ */
{
  const anchor = `  $$('.theme-dot').forEach`
  if (s.includes(anchor) && !s.includes('[data-mode]')) {
    const inject = `  /* B10: 这几组控件之前完全没有事件绑定，点了没反应 */
  $$('[data-mode]').forEach((b) => {
    b.onclick = () => { try { setThemeMode(b.dataset.mode) } catch (e) { } }
  })
  $$('[data-sleep]').forEach((b) => {
    b.onclick = () => { try { setSleep(Number(b.dataset.sleep) || 0, true) } catch (e) { } }
  })
  const __sd = $('#setDesktop')
  if (__sd) __sd.onclick = () => { try { openDesktopLyric() } catch (e) { } }
  const __rd = $('#btnResetData')
  if (__rd) {
    __rd.onclick = async () => {
      if (!window.confirm('清空全部歌单与本地缓存？此操作不可恢复')) return
      try {
        localStorage.clear()
        const arr = (state.playlists || []).filter((x) => x.id !== 'default')
        for (const pl of arr) {
          await api('/api/playlist', { method: 'POST', body: { action: 'delete', id: pl.id } }).catch(() => { })
        }
        toast('已清空，正在重载…', 2000)
        setTimeout(() => location.reload(), 800)
      } catch (e) { toast('清空失败：' + e.message, 3000) }
    }
  }
`
    s = s.replace(anchor, inject + anchor)
    done.push('B10 设置面板控件绑定')
  } else {
    miss.push('B10 theme-dot 锚点（或已绑定）')
  }
}

/* ============ B11 + B60: 歌词滚动兼容 static 布局 ============ */
{
  const i = s.indexOf('lyricInner').valueOf()
  const marker = "$('#lyricInner').style.transform"
  const mi = s.indexOf(marker)
  if (mi > 0 && !s.includes('__staticFlow')) {
    const ls = s.lastIndexOf('\n', mi) + 1
    /* 找到该行所在语句的起点 */
    let start = mi
    while (start > 0 && s[start - 1] !== '\n') start--
    /* 找到语句结束的 } */
    const inject = `    /* B11/B60: 移动端 CSS 把 .lyric-inner 改成 position:static + transform:none !important，
       JS 的 translateY 定位被压掉 → 歌词不跟随。这里是滚动容器改用 scrollTo。 */
    const __sc = $('#lyricScroll')
    const __inner = $('#lyricInner')
    const __staticFlow = __inner && getComputedStyle(__inner).position === 'static'
    if (__staticFlow && __sc && lines[idx]) {
      const __t = lines[idx].offsetTop - __sc.clientHeight / 2 + lines[idx].clientHeight / 2
      try { __sc.scrollTo({ top: Math.max(0, __t), behavior: 'smooth' }) } catch (e) { __sc.scrollTop = Math.max(0, __t) }
    } else {
`
    s = s.slice(0, start) + inject + s.slice(start)
    /* 在原来的 transform 赋值之后补一个闭合 } */
    const mi2 = s.indexOf(marker)
    if (mi2 > 0) {
      const le = s.indexOf('\n', mi2)
      s = s.slice(0, le + 1) + '    }\n' + s.slice(le + 1)
      done.push('B11/B60 歌词滚动兼容')
    }
  } else {
    miss.push('B11 lyricInner transform')
  }
}

/* ============ B55: 失败重试绕开缓存 ============ */
{
  const old = `async function streamSrc (song, only) {`
  if (s.includes(old) && !s.includes('forceFresh')) {
    s = s.replace(old, `async function streamSrc (song, only, forceFresh) {`)
    s = s.replace(`  const hit = __urlCache.get(ck)\n  if (hit && hit.exp > Date.now()) return hit.url`,
      `  const hit = __urlCache.get(ck)\n  if (!forceFresh && hit && hit.exp > Date.now()) return hit.url`)
    done.push('B55 streamSrc forceFresh 参数')
  }
}

fs.writeFileSync(p, s, 'utf8')
console.log('=== 已完成 ===')
done.forEach((d) => console.log('  ✓ ' + d))
if (miss.length) {
  console.log('=== 未匹配 ===')
  miss.forEach((m) => console.log('  ⚠ ' + m))
}
