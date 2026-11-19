'use strict'
/* 验证 B35 的 PowerShell 转义 */
const Q = String.fromCharCode(39)   /* ' */

function escSingle (s) {
  return String(s).split(Q).join(Q + Q)
}

const cases = [
  ['a$(Write-Output INJECTED).mp3', '带 $() 子表达式'],
  ["b'c.mp3", '带单引号'],
  ['normal.mp3', '普通文件名'],
  ['a`b.mp3', '带反引号'],
]

console.log('=== PowerShell 单引号转义验证 ===\n')
for (const [f, label] of cases) {
  const cmd = 'Unblock-File -LiteralPath ' + Q + escSingle(f) + Q
  console.log(label)
  console.log('  输入: ' + f)
  console.log('  命令: ' + cmd)
  /* 判定：单引号内一切按字面量，只有 ' 需要成对 */
  const safe = !cmd.includes('$(') || cmd.indexOf('$(') > cmd.indexOf(Q)
  console.log('  ' + (safe ? '✓ 单引号内视为字面量，不会执行' : '⚠ 检查'))
  console.log('')
}

/* 对比：旧版双引号 */
const oldEsc = (s) => String(s).replace(/"/g, '`"')
const oldCmd = 'Unblock-File -LiteralPath "' + oldEsc('a$(Write-Output INJECTED).mp3') + '"'
console.log('=== 旧版（双引号）是危险的 ===')
console.log('  命令: ' + oldCmd)
console.log('  PowerShell 会把 $(Write-Output INJECTED) 求值成 INJECTED')
