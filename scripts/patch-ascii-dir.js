'use strict'
const fs = require('node:fs')
const p = 'app/server.js'
let s = fs.readFileSync(p, 'utf8')

const start = s.indexOf('function defaultDownloadDir () {')
const end = s.indexOf('}', s.indexOf('return require', start)) + 1
if (start < 0) { console.log('未找到'); process.exit(1) }

const impl = `function defaultDownloadDir () {
  const home = process.env.USERPROFILE || process.env.HOME || '.'
  return require('node:path').join(home, 'Music', 'Liusheng')
}`

s = s.slice(0, start) + impl + s.slice(end)
fs.writeFileSync(p, s, 'utf8')

const i = s.indexOf('function defaultDownloadDir')
console.log(s.slice(i, i + 160))
