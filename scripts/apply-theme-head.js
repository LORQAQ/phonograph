'use strict'
/* 用新的主题变量块替换 style.css 开头的 :root 段 */
const fs = require('node:fs')
const cssPath = 'public/style.css'
const patchPath = 'public/theme-patch.css'

let css = fs.readFileSync(cssPath, 'utf8')
const patch = fs.readFileSync(patchPath, 'utf8')

// 去掉 patch 文件末尾的 *{} 与 body{} 定义，只保留 :root 与主题块
const cut = patch.indexOf('*{box-sizing')
const head = cut > 0 ? patch.slice(0, cut).trimEnd() + '\n' : patch

const idx = css.indexOf('*{box-sizing')
if (idx < 0) { console.log('未找到 *{box-sizing 锚点'); process.exit(1) }
css = head + css.slice(idx)
fs.writeFileSync(cssPath, css, 'utf8')
console.log('style.css 头部已替换，剩余行数:', css.split('\n').length)
