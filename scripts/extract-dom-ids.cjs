'use strict'
/* 从 index.html 提取全部 id，生成测试用的 id 列表 */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

const h = fs.readFileSync('public/index.html', 'utf8')
const ids = []
const re = /id=["']([^"']+)["']/g
let m
while ((m = re.exec(h))) ids.push(m[1])

const uniq = Array.from(new Set(ids))
console.log('id 共 ' + uniq.length + ' 个:')
console.log(JSON.stringify(uniq, null, 0))

/* 同时提取 class 里出现过的、代码里用于 querySelectorAll 的选择器 */
const app = fs.readFileSync('public/app.js', 'utf8')
const sels = new Set()
const re2 = /querySelectorAll\(\s*['"]([^'"]+)['"]/g
while ((m = re2.exec(app))) sels.add(m[1])
const re3 = /\$\$\(\s*['"]([^'"]+)['"]/g
while ((m = re3.exec(app))) sels.add(m[1])
console.log('\n$$ 用到的选择器:')
console.log(JSON.stringify(Array.from(sels), null, 0))

fs.writeFileSync('build/_ids.json', JSON.stringify({ ids: uniq, sels: Array.from(sels) }, null, 2), 'utf8')
