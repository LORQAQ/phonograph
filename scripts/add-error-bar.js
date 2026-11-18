'use strict'
/* 页面错误可视化：有 JS 错误就在顶部显示红条，便于用户截图反馈 */
const fs = require('node:fs')
const p = 'public/index.html'
let h = fs.readFileSync(p, 'utf8')

if (!h.includes('__errBar')) {
  const bar = [
    '',
    '<div id="__errBar" style="display:none;position:fixed;left:0;right:0;top:0;z-index:9999;background:#c0392b;color:#fff;font-size:12px;line-height:1.5;padding:6px 10px;white-space:pre-wrap;max-height:40vh;overflow:auto"></div>',
    '<script>',
    'window.addEventListener("load", function () {',
    '  setTimeout(function () {',
    '    var e = window.__errs || [];',
    '    if (!e.length) return;',
    '    var b = document.getElementById("__errBar");',
    '    if (!b) return;',
    '    b.style.display = "block";',
    '    b.textContent = "页面错误(" + e.length + "):\\n" + e.join("\\n");',
    '  }, 2500);',
    '});',
    '</script>',
    '',
  ].join('\n')

  h = h.replace('</body>', bar + '</body>')
  fs.writeFileSync(p, h, 'utf8')
  console.log('错误提示条已加')
} else {
  console.log('已存在')
}

/* 同时把 __errs 的噪音过滤放宽（避免误显示音源脚本的正常失败） */
let a = fs.readFileSync('public/app.js', 'utf8')
if (!a.includes('__NOISE2__')) {
  a = a.replace(
    "window.__errs = []",
    "window.__errs = []\nwindow.__NOISE2__ = /lx-source|ikunshare|sixyin|AggregateError|scripts|音源/i"
  )
  fs.writeFileSync('public/app.js', a, 'utf8')
  console.log('噪音过滤已加')
}
