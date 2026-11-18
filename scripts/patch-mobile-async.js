'use strict'
/* 手机端加固：HTTP 改异步桥 + 音源脚本懒加载 */
const fs = require('node:fs')
const path = require('node:path')

const WWW = path.resolve(__dirname, '../mobile/www')
const apiPath = path.join(WWW, 'api-mobile.js')
const engPath = path.join(WWW, 'lib', 'lx-engine-web.js')

/* ---- api-mobile.js ---- */
let a = fs.readFileSync(apiPath, 'utf8')

// nativeHttp 改走异步桥
a = a.replace(/function nativeHttp \(url, opts\) \{[\s\S]*?\n  \}\n\n/, `function nativeHttp (url, opts) {
    return window.NativeHttp.request(url, opts)
  }

`)

// 移除“启动后立即加载全部脚本”
a = a.replace(/[ \t]*\/\* 启动后异步加载全部音源脚本（不阻塞界面） \*\/[\s\S]*?\}, 600\)\n/, '')

// 注入 ensureScripts（首次取流时才初始化脚本）
a = a.replace('  window.__MOBILE__ = true', `  let scriptsLoading = null
  async function ensureScripts () {
    const M = window.LxScriptManager
    if (!M || !window.LX_SOURCES) return
    if (M.ready) return
    if (!scriptsLoading) scriptsLoading = M.loadAll(window.LX_SOURCES)
    try { await scriptsLoading } catch (e) {}
  }
  window.ensureScripts = ensureScripts

  window.__MOBILE__ = true`)

// /api/url 的脚本分支前等待脚本就绪
a = a.replace("      if (window.LxScriptManager) {\n        try {", "      if (window.LxScriptManager) {\n        try {\n          await ensureScripts()")

fs.writeFileSync(apiPath, a, 'utf8')

/* ---- lx-engine-web.js ---- */
let e = fs.readFileSync(engPath, 'utf8')
e = e.replace(/  function nativeHttp \(url, opts\) \{[\s\S]*?\n  \}\n/, `  function nativeHttp (url, opts) {
    if (window.NativeHttp) return window.NativeHttp.request(url, opts)
    return Promise.reject(new Error('原生桥不可用'))
  }
`)
fs.writeFileSync(engPath, e, 'utf8')

/* ---- index.html：引入 native-http.js ---- */
const htmlPath = path.join(WWW, 'index.html')
let h = fs.readFileSync(htmlPath, 'utf8')
if (!h.includes('native-http.js')) {
  h = h.replace('<script src="lib/lx-engine-web.js"></script>',
    '<script src="lib/native-http.js"></script>\n<script src="lib/lx-engine-web.js"></script>')
}
fs.writeFileSync(htmlPath, h, 'utf8')

console.log('✅ 手机端加固完成')
console.log('nativeHttp 异步:', a.includes('NativeHttp.request'))
console.log('懒加载:', a.includes('ensureScripts'))
console.log('index 引入:', h.includes('native-http.js'))
