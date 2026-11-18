'use strict'
/* 透传 Location 头，让浏览器能跟随中转源的 301 */
const fs = require('node:fs')
const p = 'app/server.js'
let s = fs.readFileSync(p, 'utf8')

if (!s.includes("outHeaders.Location")) {
  const anchor = "    if (up.headers['content-length']) outHeaders['Content-Length'] = up.headers['content-length']"
  if (s.includes(anchor)) {
    s = s.replace(anchor, anchor + "\n    if (up.headers.location) outHeaders.Location = up.headers.location")
    fs.writeFileSync(p, s, 'utf8')
    console.log('Location 透传已加')
  } else {
    console.log('未找到插入点')
  }
} else {
  console.log('已存在')
}
