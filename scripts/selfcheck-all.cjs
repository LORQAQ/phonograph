'use strict'
/**
 * 全面自检 master —— 一次跑完所有关键验证
 * 只跑「当前仍然有意义」的那批，跳过已经被后续脚本取代的
 */
const path = require('node:path')
const fs = require('node:fs')
const { execFileSync } = require('node:child_process')
process.chdir(path.resolve(__dirname, '..'))

const NODE = path.join(process.cwd(), 'runtime', 'node.exe')

const SUITES = [
  ['服务端全量回归', 'scripts/regress-all.cjs'],
  ['检查更新实现', 'scripts/verify-update.cjs'],
  ['第六轮 5 项', 'scripts/verify-round6.cjs'],
  ['写方法修复', 'scripts/verify-write-fix.cjs'],
  ['APK 归档校验', 'scripts/verify-apk-archived.cjs'],
  ['打包产物一致性', 'scripts/verify-packaged-posts.cjs'],
  ['CSS 布局计算', 'scripts/check-css-math.cjs'],
  ['APK 内容', 'scripts/verify-apk.cjs'],
  ['安装包内容', 'scripts/verify-installer.cjs'],
  ['LAN Origin', 'scripts/test-lan-origin.cjs'],
  ['检查更新实测', 'scripts/test-update-live.cjs'],
]

const results = []

function run (name, file) {
  if (!file) return
  if (!fs.existsSync(file)) {
    results.push({ name, ok: false, msg: '脚本不存在' })
    console.log('  ✗ ' + name + '  — 脚本不存在: ' + file)
    return
  }
  const t0 = Date.now()
  let out = ''
  let code = 0
  try {
    out = execFileSync(NODE, [file], { encoding: 'utf8', timeout: 600000, cwd: process.cwd() })
  } catch (e) {
    out = String(e.stdout || '') + String(e.stderr || '')
    code = e.status === undefined ? 1 : e.status
  }
  const ms = Date.now() - t0

  /* 提取「通过 X / 失败 Y」 */
  const m = out.match(/通过\s*(\d+)\s*\/\s*失败\s*(\d+)/)
  const passN = m ? Number(m[1]) : null
  const failN = m ? Number(m[2]) : null

  const ok = (code === 0) && (failN === null || failN === 0)
  if (m) {
    results.push({ name, ok, pass: passN, fail: failN, ms })
    console.log('  ' + (ok ? '✓' : '✗') + ' ' + name.padEnd(22) + passN + '/' + (passN + failN) + '  ' + ms + 'ms')
    if (!ok) {
      const fails = out.match(/- [^\n]+/g) || []
      fails.slice(0, 6).forEach((f) => console.log('      ' + f))
    }
  } else {
    /* 没有计数输出，看 exit code */
    results.push({ name, ok: code === 0, ms, raw: true })
    console.log('  ' + (code === 0 ? '✓' : '✗') + ' ' + name.padEnd(22) + '(no count)  ' + ms + 'ms')
    if (code !== 0) {
      console.log('      ' + out.split('\n').filter((x) => x.trim()).slice(-6).join('\n      '))
    }
  }
}

console.log('================ 全面自检 ================\n')
for (const [name, file] of SUITES) run(name, file)

console.log('\n================ 汇总 ================')
const total = results.length
const okN = results.filter((r) => r.ok).length
console.log('套件: ' + okN + '/' + total + ' 通过')

const allPass = results.filter((r) => r.pass !== undefined)
if (allPass.length) {
  const sumPass = allPass.reduce((a, r) => a + (r.pass || 0), 0)
  const sumFail = allPass.reduce((a, r) => a + (r.fail || 0), 0)
  console.log('断言: ' + sumPass + '/' + (sumPass + sumFail) + ' 通过')
}

if (okN < total) {
  console.log('\n失败套件:')
  results.filter((r) => !r.ok).forEach((r) => console.log('  - ' + r.name + (r.msg ? ' (' + r.msg + ')' : '')))
  process.exitCode = 1
} else {
  console.log('\n全部通过')
}
