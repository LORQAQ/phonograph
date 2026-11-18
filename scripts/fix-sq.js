'use strict'
/* 把生成代码里的 SQ 占位符替换成真正的单引号字符 */
const fs = require('node:fs')
const p = 'app/server.js'
let s = fs.readFileSync(p, 'utf8')

const before = (s.match(/\bSQ\b/g) || []).length
if (!before) { console.log('没有 SQ 占位符'); process.exit(0) }

/* SQ 表示单引号字面量："'" */
s = s.replace(/\bSQ\b/g, '"\'"')

fs.writeFileSync(p, s, 'utf8')
const after = (s.match(/\bSQ\b/g) || []).length
console.log('替换 SQ:', before, '→', after)
