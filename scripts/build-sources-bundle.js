'use strict'
/* 把 sources/*.js 打包成 mobile/www/sources-data.js（脚本内容作为字符串常量，file:// 下可直接加载） */
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const SRC = path.join(ROOT, 'sources')
const OUT = path.join(ROOT, 'mobile', 'www', 'sources-data.js')

/* P1: 手机端不能用这几个 —— xingkong 在手机上 init 会同步卡死。
   生成器原来没有黑名单，重跑一次就会把这个源塞回手机包。 */
const MOBILE_EXCLUDE = ['xingkong']
const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.js')).filter((f) => !MOBILE_EXCLUDE.includes(f.replace(/\.js$/i, '')))
const items = files.map((f) => ({
  id: f.replace(/\.js$/, ''),
  code: fs.readFileSync(path.join(SRC, f), 'utf8'),
}))

const content = 'window.LX_SOURCES=' + JSON.stringify(items) + ';\n'
fs.writeFileSync(OUT, content, 'utf8')
console.log('生成 sources-data.js:', items.length, '个脚本,', Math.round(content.length / 1024), 'KB')
