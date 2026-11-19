'use strict'
/* 第 6 批前端（简化版）：B58 / B63 / B66 / B10 / B55 / B70 */
process.chdir(require('node:path').resolve(__dirname, '..'))

const fs = require('node:fs')
const p = 'public/app.js'
let s = fs.readFileSync(p, 'utf8')
const done = []
const miss = []

/* ---------- B58: 下载弹窗 XSS ---------- */
{
  let n = 0
  s = s.replace(/\+ \(song \? \(song\.name \+ ' - ' \+ song\.singer\) : ''\) \+ '<\/div>'/g, () => {
    n++
    return "+ esc(song ? (song.name + ' - ' + song.singer) : '') + '</div>'"
  })
  if (n > 0) done.push('B58 下载弹窗 XSS × ' + n)
  else miss.push('B58')
}

/* ---------- B63: 下载失败提示 ---------- */
{
  const old = `    toast('下载失败：目录不可写，请在设置里换个位置（如 D:\\\\Music）', 4200)`
  if (s.includes(old)) {
    s = s.replace(old, `    toast('下载失败：' + ((r0 && r0.error) || '未知错误'), 4200)`)
    done.push('B63 下载失败提示')
  } else {
    miss.push('B63')
  }
}

/* ---------- B66: 搜索序号 ---------- */
{
  if (s.includes('  if (!kw || state.loading) return')) {
    s = s.replace('  if (!kw || state.loading) return', `  /* B66: 不再因 loading 丢弃新搜索 */
  if (!kw) return`)
    done.push('B66 去掉 loading 早退')
  } else {
    miss.push('B66 loading 早退')
  }
}

/* ---------- B10: 设置面板控件绑定 ---------- */
{
  const anchor = `  $$('.theme-dot')`
  if (s.includes(anchor) && !s.includes('data-mode')) {
    const inject = `  /* B10: 这几组控件之前完全没有 onclick */
  $$('[data-mode]').forEach((b) => { b.onclick = () => { try { setThemeMode(b.dataset.mode) } catch (e) { } } })
  $$('[data-sleep]').forEach((b) => { b.onclick = () => { try { setSleep(Number(b.dataset.sleep) || 0, true) } catch (e) { } } })
  ;(() => {
    const sd = $('#setDesktop')
    if (sd) sd.onclick = () => { try { openDesktopLyric() } catch (e) { } }
    const rd = $('#btnResetData')
    if (rd) rd.onclick = async () => {
      if (!window.confirm('清空全部歌单与本地缓存？此操作不可恢复')) return
      try {
        const arr = (state.playlists || []).filter((x) => x.id !== 'default')
        for (const pl of arr) await api('/api/playlist', { method: 'POST', body: { action: 'delete', id: pl.id } }).catch(() => { })
        localStorage.clear()
        toast('已清空，正在重载…', 2000)
        setTimeout(() => location.reload(), 800)
      } catch (e) { toast('清空失败：' + e.message, 3000) }
    }
  })()
`
    s = s.replace(anchor, inject + anchor)
    done.push('B10 设置面板控件绑定')
  } else {
    miss.push('B10 theme-dot')
  }
}

/* ---------- B55: streamSrc forceFresh ---------- */
{
  if (s.includes('async function streamSrc (song, only)') && !s.includes('forceFresh')) {
    s = s.replace('async function streamSrc (song, only)', 'async function streamSrc (song, only, forceFresh)')
    s = s.replace("const hit = __urlCache.get(ck)\n  if (hit && hit.exp > Date.now()) return hit.url",
      "const hit = __urlCache.get(ck)\n  if (!forceFresh && hit && hit.exp > Date.now()) return hit.url")
    done.push('B55 streamSrc forceFresh')
  } else {
    miss.push('B55')
  }
}

/* ---------- B70: 去掉永久 setInterval ---------- */
{
  const old1 = `setInterval(syncLyricPlayBtn, 400)`
  if (s.includes(old1)) {
    s = s.replace(old1, `/* B70: 改事件驱动，别再每 400ms 轮询 DOM */
audio.addEventListener('play', syncLyricPlayBtn)
audio.addEventListener('pause', syncLyricPlayBtn)
audio.addEventListener('loadedmetadata', syncLyricPlayBtn)`)
    done.push('B70 歌词按钮改事件驱动')
  } else {
    miss.push('B70 syncLyricPlayBtn')
  }
}

fs.writeFileSync(p, s, 'utf8')
console.log('=== 已完成 ===')
done.forEach((d) => console.log('  ✓ ' + d))
if (miss.length) {
  console.log('=== 未匹配 ===')
  miss.forEach((m) => console.log('  ⚠ ' + m))
}
