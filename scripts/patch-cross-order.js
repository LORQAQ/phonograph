'use strict'
/* 跨平台兜底顺序改成「酷狗优先」——酷狗源一般返回 mp3，QQ 源多是 m4a */
const fs = require('node:fs')

for (const p of ['app/server.js', 'mobile/www/api-mobile.js']) {
  let s = fs.readFileSync(p, 'utf8')
  const before = s
  s = s.split("['tx', 'kg', 'wy']").join("['kg', 'tx', 'wy']")
  s = s.split("['tx','kg']").join("['kg','tx']")
  fs.writeFileSync(p, s, 'utf8')
  console.log(p + ':', before !== s ? '已改为酷狗优先' : '未找到循环')
}
