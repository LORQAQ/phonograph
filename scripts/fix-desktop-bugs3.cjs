'use strict'
/* 修 B5（shutdown 落盘）和 B23（去重含平台），按真实代码 */
const fs = require('node:fs')

const sp = 'app/server.js'
let s = fs.readFileSync(sp, 'utf8')
const done = []

/* ---------- B5 ---------- */
const oldExit = `      setTimeout(() => { console.log('收到退出指令，服务关闭'); process.exit(0) }, 150)`
const newExit = `      /* B5: 退出前同步写盘，避免最后一次修改丢失 */
      try {
        if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
        writeDbNow()
        console.log('数据已保存')
      } catch (e) { console.error('[db] 退出前保存失败', e.message) }
      setTimeout(() => { console.log('收到退出指令，服务关闭'); process.exit(0) }, 300)`

if (s.includes(oldExit)) {
  s = s.replace(oldExit, newExit)
  done.push('B5 退出前落盘')
} else {
  console.log('B5 仍未匹配')
}

/* ---------- B23 ---------- */
const oldDedup = `.songs.some((s) => s.id === body.song.id)`
const newDedup = `.songs.some((s) => s.id === body.song.id && (s.source || 'wy') === (body.song.source || 'wy'))`

if (s.includes(oldDedup)) {
  s = s.replace(oldDedup, newDedup)
  done.push('B23 去重含平台')
} else {
  console.log('B23 仍未匹配')
}

fs.writeFileSync(sp, s, 'utf8')
console.log('\n本轮:')
done.forEach((d) => console.log('  ✓ ' + d))

/* ---------- 验证全部桌面端修复 ---------- */
console.log('\n=== 全部桌面端修复验证 ===')
const a = fs.readFileSync('public/app.js', 'utf8')
const checks = [
  ['B3 token 校验', a.includes('if (token !== state.playToken) return')],
  ['B4 空 src 处理', a.includes('audio.removeAttribute(\'src\')')],
  ['B5 退出前落盘', s.includes('writeDbNow()') && s.includes('数据已保存')],
  ['B6 db 原子写', s.includes('fs.renameSync(tmp, DB_FILE)')],
  ['B6 损坏备份', s.includes('已备份到')],
  ['B10 删除路径校验', s.includes('只能删除音频文件')],
  ['B23 去重含平台', s.includes("(s.source || 'wy') === (body.song.source || 'wy')")],
  ['S1 默认本机', s.includes("PHONOGRAPH_LAN === '1'")],
  ['S4 静态路径边界', s.includes('__rel.startsWith')],
]
let ok = 0
for (const [n, p] of checks) { console.log('  ' + (p ? '✓' : '✗') + ' ' + n); if (p) ok++ }
console.log('\n通过 ' + ok + '/' + checks.length)
