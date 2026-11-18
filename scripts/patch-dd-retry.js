'use strict'
/* 下拉美化：boot 时机不可靠，改成多次尝试 + 定时兜底 */
const fs = require('node:fs')
let app = fs.readFileSync('public/app.js', 'utf8')

const oldCall = "  $$('select').forEach(enhanceSelect)"
const newCall = `  /* 原生 select 换主题化下拉：多次尝试，避免渲染时机问题 */
  const _tryDd = () => {
    try {
      const sels = $$('select')
      if (!sels.length) return false
      sels.forEach(enhanceSelect)
      return document.querySelectorAll('.dd').length > 0
    } catch (e) { return false }
  }
  _tryDd()
  setTimeout(_tryDd, 400)
  setTimeout(_tryDd, 1500)`

if (app.includes(oldCall)) {
  app = app.replace(oldCall, newCall)
  fs.writeFileSync('public/app.js', app, 'utf8')
  console.log('已改为多次尝试')
} else if (app.includes('_tryDd')) {
  console.log('已存在')
} else {
  console.log('未找到调用点')
}
