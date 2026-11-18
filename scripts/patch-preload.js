'use strict'
/* 性能：启动后在后台预热音源脚本，避免首次播放卡在脚本初始化 */
const fs = require('node:fs')

/* ---------- api-mobile：暴露预热函数 ---------- */
let mob = fs.readFileSync('mobile/www/api-mobile.js', 'utf8')
if (!mob.includes('preloadScripts')) {
  mob = mob.replace(
    'window.mobileApi = async function mobileApi',
    `/* 后台预热：让脚本初始化不阻塞首次播放 */
window.preloadScripts = function () {
  if (window.__scriptsPreloading) return window.__scriptsPreloading
  window.__scriptsPreloading = (async () => {
    try {
      await ensureScripts()
      console.log('[留声] 音源脚本预热完成', (window.LxScriptManager && window.LxScriptManager.list().length) || 0)
    } catch (e) {
      console.warn('[留声] 音源预热失败', e && e.message)
    }
  })()
  return window.__scriptsPreloading
}

window.mobileApi = async function mobileApi`
  )
}
fs.writeFileSync('mobile/www/api-mobile.js', mob, 'utf8')
console.log('api-mobile 预热函数:', mob.includes('window.preloadScripts'))

/* ---------- app.js：启动时触发预热 ---------- */
let app = fs.readFileSync('public/app.js', 'utf8')
if (!app.includes('preloadScripts')) {
  app = app.replace(
    "  $$('select').forEach(enhanceSelect)",
    `  $$('select').forEach(enhanceSelect)

  /* 后台预热音源脚本，第一次点歌就不用等脚本加载 */
  setTimeout(() => {
    try {
      if (window.preloadScripts) window.preloadScripts()
      else if (window.mobileApi) window.mobileApi('/api/sources').catch(() => {})
    } catch (e) {}
  }, 1200)`
  )
}
fs.writeFileSync('public/app.js', app, 'utf8')
console.log('app.js 触发预热:', app.includes('window.preloadScripts'))
