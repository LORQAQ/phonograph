'use strict'
/* 手机端音源取不到地址：检查原生 HTTP 是否透传 headers / cookie */
const fs = require('node:fs')

const nh = fs.readFileSync('mobile/www/lib/native-http.js', 'utf8')
console.log('=== native-http.js 全文 ===')
console.log(nh)

const java = 'C:/Users/Administrator/Documents/deepseek-harness/default-workspace/apk-build/app/src/com/phonograph/player/NapiBridge.java'
if (fs.existsSync(java)) {
  const j = fs.readFileSync(java, 'utf8')
  console.log('\n=== NapiBridge.httpAsync 实现 ===')
  const i = j.indexOf('httpAsync')
  if (i > 0) {
    let depth = 0, started = false, end = i
    for (let k = i; k < j.length; k++) {
      if (j[k] === '{') { depth++; started = true } else if (j[k] === '}') { depth--; if (started && depth === 0) { end = k + 1; break } }
    }
    console.log(j.slice(i, Math.min(end, i + 2500)))
  }
} else {
  console.log('\nNapiBridge.java 不在预期路径')
}
