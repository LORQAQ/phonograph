'use strict'
/* 加强错误提示：把堆栈也显示出来，方便定位是哪个元素 */
const fs = require('node:fs')
const p = 'public/index.html'
let h = fs.readFileSync(p, 'utf8')

const MARK = '<!-- 详细错误 -->'
if (h.includes(MARK)) {
  console.log('已存在')
  process.exit(0)
}

/* 找现有的 __errBar 脚本，替换成更详细的 */
const oldScript = `<script>
window.addEventListener("load", function () {
  setTimeout(function () {
    var e = window.__errs || [];
    if (!e.length) return;
    var b = document.getElementById("__errBar");
    if (!b) return;
    b.style.display = "block";
    b.textContent = "页面错误(" + e.length + "):\\n" + e.join("\\n");
  }, 2500);
});
</script>`

const newScript = `${MARK}
<script>
window.addEventListener("load", function () {
  setTimeout(function () {
    var e = window.__errs || [];
    if (!e.length) return;
    var b = document.getElementById("__errBar");
    if (!b) return;
    b.style.display = "block";
    b.textContent = "页面错误(" + e.length + "):\\n" + e.join("\\n");
    /* 同时输出到控制台，方便 F12 查看完整堆栈 */
    e.forEach(function (m) { try { console.warn("[留声错误]", m) } catch (_) {} });
  }, 2500);
});

/* 捕获所有 Promise 拒绝的完整堆栈 */
window.addEventListener("unhandledrejection", function (ev) {
  var r = ev.reason;
  var msg = "promise: " + (r && r.message ? r.message : String(r));
  var st = r && r.stack ? String(r.stack).split("\\n").slice(0, 4).join(" | ") : "";
  (window.__errs = window.__errs || []).push(st ? msg + "\\n  " + st : msg);
});
</script>`

if (h.includes(oldScript)) {
  h = h.replace(oldScript, newScript)
  fs.writeFileSync(p, h, 'utf8')
  console.log('已替换为详细错误版')
} else {
  /* 直接追加到 </body> 前 */
  h = h.replace('</body>', newScript + '\n</body>')
  fs.writeFileSync(p, h, 'utf8')
  console.log('已追加详细错误捕获')
}
