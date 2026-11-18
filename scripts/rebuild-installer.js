'use strict'
/* 重新打包桌面安装包：同步 payload → 压 zip → 编译内嵌 */
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync, execSync } = require('node:child_process')

const ROOT = process.cwd()
const PAYLOAD = path.join(ROOT, 'build', 'payload')

console.log('=== 1. 同步 payload ===')
function copyDir (src, dst) {
  fs.mkdirSync(dst, { recursive: true })
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name)
    const d = path.join(dst, e.name)
    if (e.isDirectory()) copyDir(s, d)
    else {
      try { fs.copyFileSync(s, d) } catch (err) { }
    }
  }
}

for (const dir of ['app', 'public', 'sources']) {
  const src = path.join(ROOT, dir)
  if (!fs.existsSync(src)) continue
  copyDir(src, path.join(PAYLOAD, dir))
  console.log('  同步 ' + dir)
}
for (const f of ['留声.exe', 'LXMusic.ico', 'README.md', 'Microsoft.Web.WebView2.Core.dll', 'Microsoft.Web.WebView2.WinForms.dll', 'Microsoft.Web.WebView2.Core.dll.config']) {
  const src = path.join(ROOT, f)
  if (fs.existsSync(src)) {
    try { fs.copyFileSync(src, path.join(PAYLOAD, f)) } catch (e) { }
  }
}
console.log('  payload 文件数:', fs.readdirSync(PAYLOAD).length)

console.log('=== 2. 打包 payload.zip ===')
const zipPath = path.join(ROOT, 'build', 'payload.zip')
try { fs.unlinkSync(zipPath) } catch (e) { }
try {
  execSync('powershell -NoProfile -Command "Compress-Archive -Path \'' + PAYLOAD + '\\*\' -DestinationPath \'' + zipPath + '\' -CompressionLevel Optimal -Force"', { stdio: 'inherit' })
  const sz = fs.statSync(zipPath).size
  console.log('  zip 大小: ' + (sz / 1048576).toFixed(1) + ' MB')
} catch (e) {
  console.log('  压缩失败:', e.message)
  process.exit(1)
}

console.log('=== 3. 编译安装包 ===')
const csc = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe'
const out = path.join(ROOT, '留声-1.0.0-安装包.exe')
const args = [
  '/nologo', '/target:winexe', '/out:' + out,
  '/win32icon:' + path.join(ROOT, 'LXMusic.ico'),
  '/r:System.dll', '/r:System.Windows.Forms.dll', '/r:System.Drawing.dll',
  '/r:System.IO.Compression.dll', '/r:System.IO.Compression.FileSystem.dll',
  '/resource:' + zipPath + ',payload.zip',
  path.join(ROOT, 'scripts', 'Installer.cs'),
]
try {
  execFileSync(csc, args, { stdio: 'inherit' })
  const sz = fs.statSync(out).size
  console.log('  安装包: ' + (sz / 1048576).toFixed(1) + ' MB')
} catch (e) {
  console.log('  编译失败:', e.message)
}
