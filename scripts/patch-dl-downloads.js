'use strict'
const fs = require('node:fs')
const path = require('node:path')
const p = 'app/server.js'
let s = fs.readFileSync(p, 'utf8')

/* 默认目录改到「下载\Liusheng」，Music 是系统受保护文件夹，Node 写入 EPERM */
const start = s.indexOf('function defaultDownloadDir () {')
const end = s.indexOf('}', s.indexOf('return require', start)) + 1

const impl = `function defaultDownloadDir () {
  const home = process.env.USERPROFILE || process.env.HOME || '.'
  return require('node:path').join(home, 'Downloads', 'Liusheng')
}`

s = s.slice(0, start) + impl + s.slice(end)

/* mkdir 去掉 longPath（目录已 ASCII，长路径前缀反而可能导致失败） */
s = s.split('fs.mkdirSync(longPath(dir), { recursive: true })').join('fs.mkdirSync(dir, { recursive: true })')
s = s.split('fs.mkdirSync(longPath(wantDir), { recursive: true })').join('fs.mkdirSync(wantDir, { recursive: true })')

/* 写文件也不用 longPath（避免 \\?\ 带来的兼容问题） */
s = s.split("const tmp = longPath(full + '.part')").join("const tmp = full + '.part'")
s = s.split('const fullLong = longPath(full)').join('const fullLong = full')

fs.writeFileSync(p, s, 'utf8')

const i = s.indexOf('function defaultDownloadDir')
console.log(s.slice(i, i + 160))
console.log('longPath 已撤:', !s.includes('fs.mkdirSync(longPath(dir)'))
