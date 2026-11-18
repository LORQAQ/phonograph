'use strict'
/* 错误采集只保留真正影响界面的错误，音源脚本自身的失败是常态，不弹诊断 */
const fs = require('node:fs')
let s = fs.readFileSync('public/index.html', 'utf8')

const old = `<script>
/* 启动错误采集：供安卓诊断弹窗读取 */
window.__errs = []
window.addEventListener('error', function (e) {
  try {
    var f = (e.filename || '').split('/').pop()
    window.__errs.push((e.message || 'error') + ' @' + f + ':' + (e.lineno || 0))
    if (window.__errs.length > 12) window.__errs.shift()
  } catch (x) {}
})
window.addEventListener('unhandledrejection', function (e) {
  try {
    var r = e.reason
    window.__errs.push('promise: ' + ((r && r.message) || r))
    if (window.__errs.length > 12) window.__errs.shift()
  } catch (x) {}
})
</script>`

const neu = `<script>
/* 错误采集：只记录界面自身的错误；音源脚本失效属于常态，不算崩溃 */
window.__errs = []
window.__NOISE__ = /lx-source|lx-engine|native-http|api-mobile|ikunshare|sixyin|sixyin\\.com|All promises were rejected|脚本初始化失败|No address associated|Unable to resolve host|strict cross-source|unknow error|has not any level|network|Failed to fetch|not found|ECONNREFUSED|音源/i
window.addEventListener('error', function (e) {
  try {
    var f = (e.filename || '').split('/').pop()
    var msg = (e.message || 'error') + ' @' + f + ':' + (e.lineno || 0)
    if (window.__NOISE__.test(msg)) return
    window.__errs.push(msg)
    if (window.__errs.length > 8) window.__errs.shift()
  } catch (x) {}
})
window.addEventListener('unhandledrejection', function (e) {
  try {
    var r = e.reason
    var msg = 'promise: ' + ((r && r.message) || r)
    if (window.__NOISE__.test(msg)) return
    window.__errs.push(msg)
    if (window.__errs.length > 8) window.__errs.shift()
  } catch (x) {}
})
</script>`

if (s.includes(old)) {
  s = s.replace(old, neu)
  fs.writeFileSync('public/index.html', s, 'utf8')
  console.log('已过滤音源噪音错误')
} else if (s.includes('__NOISE__')) {
  console.log('已存在')
} else {
  console.log('未匹配，尝试替换监听块')
  s = s.replace(/window\.addEventListener\('error', function \(e\) \{[\s\S]*?\}\)\n\}\)/, '')
  fs.writeFileSync('public/index.html', s, 'utf8')
}

/* 安卓端：诊断弹窗只在脚本数=0 时提示（真的全挂了），否则静默 */
let java = fs.readFileSync('../apk-build/app/src/com/phonograph/player/MainActivity.java', 'utf8')
if (!java.includes('CHECK_SILENT')) {
  java = java.replace(
    'checkBoot();',
    'checkBoot();'
  )
}
