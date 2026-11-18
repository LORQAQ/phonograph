'use strict'
/* 暴力方案：去掉 explorer 依赖 —— 「打开目录」直接变成「复制路径 + 提示」 */
const fs = require('node:fs')
const p = 'public/app.js'
let s = fs.readFileSync(p, 'utf8')

/* 头部按钮：只留复制路径与刷新 */
s = s.replace(
  `      <button class="btn-mini" id="dlCopyDir">复制路径</button>
      <button class="btn-mini" id="dlOpenDir">打开目录</button>
      <button class="btn-mini" id="dlRefresh">刷新</button>`,
  `      <button class="btn-mini" id="dlCopyDir">复制路径</button>
      <button class="btn-mini" id="dlRefresh">刷新</button>`
)

/* 绑定：去掉 open 逻辑，只保留复制 */
const startMark = "  if ($('#dlOpenDir')) {"
const endMark = "  if ($('#dlRefresh')) $('#dlRefresh').onclick = () => renderDownloadsView()"
const a = s.indexOf(startMark)
const b = s.indexOf(endMark)
if (a > 0 && b > a) {
  s = s.slice(0, a) + s.slice(b)
}

/* 复制路径按钮：把路径写进剪贴板并给出可操作的提示 */
s = s.replace(
  `  if ($('#dlCopyDir')) {
    $('#dlCopyDir').onclick = async () => {
      try { await navigator.clipboard.writeText(dir); toast('路径已复制：' + dir, 3600) } catch (e) { toast('复制失败，手动选中最上方路径', 3600) }
    }
  }`,
  `  if ($('#dlCopyDir')) {
    $('#dlCopyDir').onclick = async () => {
      let ok = false
      try { await navigator.clipboard.writeText(dir); ok = true } catch (e) { }
      if (!ok) {
        try {
          const ta = document.createElement('textarea')
          ta.value = dir
          document.body.appendChild(ta)
          ta.select()
          document.execCommand('copy')
          ta.remove()
          ok = true
        } catch (e) { }
      }
      toast(ok ? '路径已复制，粘贴到资源管理器地址栏即可打开' : '复制失败，手动记下：' + dir, 4200)
    }
  }`
)

fs.writeFileSync(p, s, 'utf8')
console.log('打开按钮已移除:', !s.includes('dlOpenDir'))
console.log('复制逻辑已强化:', s.includes('execCommand'))

/* index.html 加版本号，强制刷新缓存 */
let h = fs.readFileSync('public/index.html', 'utf8')
const v = 'v=' + Date.now()
h = h.replace(/(href="\/?style\.css)(\?[^"]*)?"/, '$1?' + v + '"')
h = h.replace(/(src="\/?app\.js)(\?[^"]*)?"/, '$1?' + v + '"')
h = h.replace(/(src="\/?lib\/music-libs\.js)(\?[^"]*)?"/, '$1?' + v + '"')
fs.writeFileSync('public/index.html', h, 'utf8')
console.log('版本号已加:', h.includes('?v='))
