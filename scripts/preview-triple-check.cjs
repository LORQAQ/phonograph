'use strict'
/* onloadedmetadata 偶发不触发，改用 durationchange + 定时轮询双保险 */
const fs = require('node:fs')
const p = 'mobile/www/app.js'
let a = fs.readFileSync(p, 'utf8')

const old = `    audio.src = url
    /* 试听版检测：拿到元数据后核对时长 */
    audio.onloadedmetadata = function () {
      try { checkPreviewAndSwitch(song, audio.duration) } catch (e) { }
    }
    audio.play().catch(() => { })`

const neu = `    audio.src = url
    audio.play().catch(() => { })
    /* 残缺版检测：metadata / durationchange / 轮询 三重保险 */
    let __checked = false
    const __doCheck = () => {
      if (__checked) return
      const d = audio.duration
      if (!d || !isFinite(d) || d <= 0) return
      __checked = true
      try { checkPreviewAndSwitch(song, d) } catch (e) { }
    }
    audio.addEventListener('loadedmetadata', __doCheck, { once: true })
    audio.addEventListener('durationchange', __doCheck, { once: true })
    setTimeout(__doCheck, 1500)
    setTimeout(__doCheck, 4000)`

if (a.includes(old)) {
  a = a.replace(old, neu)
  fs.writeFileSync(p, a, 'utf8')
  console.log('残缺检测已改为三重保险')
} else {
  console.log('未匹配')
}
