'use strict'
/* 前端一致性冒烟检查：JS 引用的 id 是否都在 HTML 或 JS 模板里定义 */
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8')
const js = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8')
const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8')

const defined = new Set([
  ...[...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]),
  ...[...js.matchAll(/id="([A-Za-z0-9_-]+)"/g)].map((m) => m[1]), // JS 动态生成的 id
])
const used = new Set([...js.matchAll(/\$\(['"]#([A-Za-z0-9_-]+)['"]\)/g)].map((m) => m[1]))
const missing = [...used].filter((id) => !defined.has(id))
console.log('可用 id: ' + defined.size + ' | JS 引用: ' + used.size)
console.log(missing.length ? '❌ 缺失 id: ' + missing.join(', ') : '✅ JS 引用的 id 全部有定义')

const classes = new Set([...css.matchAll(/\.([a-z][a-z0-9-]+)/g)].map((m) => m[1]))
const usedClasses = new Set([...js.matchAll(/class="([^"$]*)"/g)].flatMap((m) => m[1].split(/\s+/)).filter(Boolean))
const noStyle = [...usedClasses].filter((c) => !classes.has(c) && !['active', 'show', 'playing', 'disabled', 'paused', 'out', 'dragging'].includes(c))
console.log(noStyle.length ? '⚠ 未定义样式的 class: ' + noStyle.join(', ') : '✅ class 样式齐全')

const server = fs.readFileSync(path.join(root, 'app/server.js'), 'utf8')
const routes = new Set([...server.matchAll(/'(\/api\/[a-z/]+)'/g)].map((m) => m[1]))
const calls = new Set([...js.matchAll(/api\('(\/api\/[a-z/?=&'"]+)/g)].map((m) => m[1].split('?')[0]))
const bad = [...calls].filter((c) => !routes.has(c.replace(/'$/, '')))
console.log(bad.length ? '❌ 前端调用了不存在的接口: ' + bad.join(', ') : '✅ 前端接口调用全部有后端实现')

// 未闭合的模板字符串/括号粗检
const braces = (js.match(/\{/g) || []).length - (js.match(/\}/g) || []).length
console.log(braces === 0 ? '✅ 大括号配平' : '⚠ 大括号差值: ' + braces)
