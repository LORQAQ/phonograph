'use strict'
const fs = require('node:fs')
const p = 'mobile/www/api-mobile.js'
let s = fs.readFileSync(p, 'utf8')

if (s.includes('window.preloadScripts')) {
  console.log('已存在')
  process.exit(0)
}

const block = [
  'window.mobileApi = mobileApi',
  '',
  '/* 后台预热：脚本初始化不阻塞首次播放 */',
  'window.preloadScripts = function () {',
  '  if (window.__scriptsPreloading) return window.__scriptsPreloading',
  '  window.__scriptsPreloading = (async () => {',
  '    try {',
  '      await ensureScripts()',
  "      console.log('[留声] 音源预热完成', (window.LxScriptManager && window.LxScriptManager.list().length) || 0)",
  '    } catch (e) {',
  "      console.warn('[留声] 音源预热失败', e && e.message)",
  '    }',
  '  })()',
  '  return window.__scriptsPreloading',
  '}',
].join('\n')

s = s.replace('window.mobileApi = mobileApi', block)
fs.writeFileSync(p, s, 'utf8')
console.log('预热函数:', s.includes('window.preloadScripts'))
