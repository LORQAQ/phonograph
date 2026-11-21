'use strict'
/* 准备外壳编译：生成 AssemblyInfo（版本从 public/app.js 读）
   同时把装配好的 exe 改名成中文。
   用法：
     node scripts/build-shell.cjs prepare     → 生成 build/_AssemblyInfo.cs
     powershell -File scripts/build-shell.ps1 → csc 编译（必须由 pwsh 直接调）
     node scripts/build-shell.cjs finalize    → 改名成 留声.exe + 校验
*/
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

const VERSION = (fs.readFileSync('public/app.js', 'utf8').match(/const APP_VERSION = '([^']+)'/) || [])[1]
if (!VERSION) { console.log('✗ 读不到 APP_VERSION'); process.exit(1) }
const parts = VERSION.split('.')
while (parts.length < 4) parts.push('0')
const asmVer = parts.slice(0, 4).join('.')
const mode = process.argv[2] || 'prepare'

if (mode === 'prepare') {
  const tpl = fs.readFileSync('scripts/AssemblyInfo.cs.template', 'utf8')
  fs.mkdirSync('build', { recursive: true })
  fs.writeFileSync('build/_AssemblyInfo.cs', tpl.replace(/VERSION_PLACEHOLDER/g, asmVer), 'utf8')
  console.log('✓ build/_AssemblyInfo.cs  版本 ' + VERSION + '（程序集 ' + asmVer + '）')
  console.log('  下一步: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\\build-shell.ps1')
  process.exit(0)
}

if (mode === 'finalize') {
  const tmp = path.join(process.cwd(), 'build', '_shell_compile.exe')
  if (!fs.existsSync(tmp)) { console.log('✗ 找不到 ' + tmp + '（先跑 build-shell.ps1）'); process.exit(1) }
  const dst = path.join(process.cwd(), '留声.exe')
  try { fs.rmSync(dst, { force: true }) } catch (e) { }
  fs.renameSync(tmp, dst)
  console.log('✓ 留声.exe  ' + (fs.statSync(dst).size / 1024).toFixed(1) + ' KB  版本 ' + VERSION)

  /* 校验程序集里确实带了版本串（ShellVersion() 依赖它） */
  const b = fs.readFileSync(dst)
  const s = b.toString('latin1')
  const hasVer = s.includes(asmVer) || s.includes(VERSION)
  console.log('  ' + (hasVer ? '✓' : '✗') + ' 程序集含版本串 ' + asmVer)
  /* 校验关键字符串都在 */
  const NEED = ['Phonograph', 'api/health', '留声']
  for (const n of NEED) {
    const ok = n === '留声' ? s.includes(Buffer.from(n, 'utf8').toString('latin1')) : s.includes(n)
    console.log('  ' + (ok ? '✓' : '✗') + ' 含 ' + n)
  }
  process.exit(0)
}

console.log('用法: node scripts/build-shell.cjs [prepare|finalize]')