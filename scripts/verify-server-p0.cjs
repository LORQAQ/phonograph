'use strict'
/* 验证服务端 P0/P1 修复 + 补 downloads/remove 写名单 */
const path = require('node:path')
process.chdir(path.resolve(__dirname, '..'))
const fs = require('node:fs')
const p = 'app/server.js'
let s = fs.readFileSync(p, 'utf8')

/* 先补 downloads/remove */
if (!s.includes("'/api/downloads/remove'")) {
  const i = s.indexOf('const WRITE_PATHS = new Set([')
  if (i > 0) {
    const end = s.indexOf('])', i)
    const block = s.slice(i, end)
    /* 在最后一个条目后加 */
    const lastQuote = block.lastIndexOf("',")
    if (lastQuote > 0) {
      const insert = block.slice(0, lastQuote + 2) + "\n        '/api/downloads/remove'," + block.slice(lastQuote + 2)
      s = s.slice(0, i) + insert + s.slice(end)
      fs.writeFileSync(p, s, 'utf8')
      console.log('✓ downloads/remove 已加入写名单')
    }
  }
} else {
  console.log('- downloads/remove 已在写名单')
}

/* 验证 */
const check = fs.readFileSync(p, 'utf8')
console.log('\n=== P0/P1 修复验证 ===')
console.log('P0-1 download-dir 不在写名单:', !/WRITE_PATHS[\s\S]{0,600}'\/api\/download-dir'/.test(check) ? '✓' : '✗')
console.log('P0-1 handler 内判定:', check.includes('/* P0-1: 写语义在这里单独判定') ? '✓' : '✗')
console.log('P0-2 flushDb 不抛:', !/console\.error\('\[db\] 写盘失败', e\.message\)\s*\n\s*throw e/.test(check) ? '✓' : '✗')
console.log('P0-2 3 秒重试:', check.includes('setTimeout(flushDb, 3000)') ? '✓' : '✗')
console.log('P0-2 uncaughtException:', check.includes("process.on('uncaughtException'") ? '✓' : '✗')
console.log('P1-1 waitForAnySource 收 platform:', check.includes('async function waitForAnySource (platform') ? '✓' : '✗')
console.log('P1-1 调用传 platform:', (check.match(/waitForAnySource\(platform\)/g) || []).length + ' 处')
console.log('P1-2 sameOrigin 含 LAN:', check.includes('__LAN_IPS || []).includes(u.hostname') ? '✓' : '✗')
console.log('P1-3 remove 写名单:', check.includes("'/api/downloads/remove'") ? '✓' : '✗')

/* 打印 WRITE_PATHS 内容 */
const wi = check.indexOf('const WRITE_PATHS')
if (wi > 0) {
  const we = check.indexOf('])', wi)
  console.log('\nWRITE_PATHS:')
  console.log(check.slice(wi, we + 2))
}
