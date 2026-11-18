'use strict'
/* 关键修复：探测文件不能以点开头（.write_test 会被某些安全策略拒绝，导致误判目录不可写） */
const fs = require('node:fs')

/* ---------- server.js ---------- */
let s = fs.readFileSync('app/server.js', 'utf8')
let n = 0
s = s.split("'.w_test'").join("'w_test.tmp'")
s = s.split("'.write_test'").join("'w_test.tmp'")
s = s.split("path.join(dir, '.w_test')").join("path.join(dir, 'w_test.tmp')")
s = s.split("path.join(dir, '.write_test')").join("path.join(dir, 'w_test.tmp')")
n = (s.match(/w_test\.tmp/g) || []).length
fs.writeFileSync('app/server.js', s, 'utf8')
console.log('server.js 探测文件已改名:', n, '处')

/* ---------- 检查 download-dir 接口里的探测 ---------- */
const i = s.indexOf("async '/api/download-dir'")
if (i > 0) {
  console.log('download-dir 片段:')
  console.log(s.slice(i, i + 900))
}
