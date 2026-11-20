'use strict'
/* 隔离测试：Node 调 csc 到底能不能写 */
const path = require('node:path')
const fs = require('node:fs')
const { execFileSync, execSync } = require('node:child_process')
process.chdir(path.resolve(__dirname, '..'))

const csc = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe'
const REFS = ['/r:System.IO.Compression.dll', '/r:System.IO.Compression.FileSystem.dll']

function tryOne (label, fn) {
  try {
    const out = fn()
    console.log('  ✓ ' + label + (out ? '  ' + out : ''))
  } catch (e) {
    const s = (String(e.stdout || '') + String(e.stderr || '')).split('\n').filter(Boolean).slice(0, 2).join(' | ')
    console.log('  ✗ ' + label + '  ' + (s || e.message))
  }
}

/* 1. execFileSync + ASCII 相对路径 */
tryOne('execFileSync → build/_t1.exe', () => {
  fs.rmSync('build/_t1.exe', { force: true })
  execFileSync(csc, ['/nologo', '/target:exe', '/out:build/_t1.exe', ...REFS, 'scripts/ZipProbe.cs'], { stdio: 'pipe', cwd: process.cwd() })
  return fs.existsSync('build/_t1.exe') ? fs.statSync('build/_t1.exe').size + 'B' : '文件不存在'
})

/* 2. execFileSync + 绝对路径 */
tryOne('execFileSync → 绝对路径', () => {
  const out = path.join(process.cwd(), 'build', '_t2.exe')
  fs.rmSync(out, { force: true })
  execFileSync(csc, ['/nologo', '/target:exe', '/out:' + out, ...REFS, 'scripts/ZipProbe.cs'], { stdio: 'pipe', cwd: process.cwd() })
  return fs.existsSync(out) ? fs.statSync(out).size + 'B' : '文件不存在'
})

/* 3. execSync + shell */
tryOne('execSync(shell) → build/_t3.exe', () => {
  fs.rmSync('build/_t3.exe', { force: true })
  execSync('"' + csc + '" /nologo /target:exe "/out:build/_t3.exe" ' + REFS.join(' ') + ' scripts\\ZipProbe.cs', { stdio: 'pipe', cwd: process.cwd() })
  return fs.existsSync('build/_t3.exe') ? fs.statSync('build/_t3.exe').size + 'B' : '文件不存在'
})

/* 4. 带 /resource 参数 */
tryOne('带 /resource → build/_t4.exe', () => {
  fs.rmSync('build/_t4.exe', { force: true })
  execFileSync(csc, ['/nologo', '/target:exe', '/out:build/_t4.exe',
    '/resource:build\\payload_utf8.zip,payload.zip', ...REFS, 'scripts/ZipProbe.cs'],
  { stdio: 'pipe', cwd: process.cwd() })
  return fs.existsSync('build/_t4.exe') ? fs.statSync('build/_t4.exe').size + 'B' : '文件不存在'
})

/* 清理 */
for (const f of ['build/_t1.exe', 'build/_t2.exe', 'build/_t3.exe', 'build/_t4.exe']) {
  try { fs.rmSync(f, { force: true }) } catch (e) { }
}