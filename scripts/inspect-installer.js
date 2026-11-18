'use strict'
/* 从安装包 exe 里提取内嵌的 payload.zip 并检查内容 */
const fs = require('node:fs')
const path = require('node:path')

const exe = '留声-1.0.0-安装包.exe'
const buf = fs.readFileSync(exe)
console.log('安装包大小: ' + (buf.length / 1048576).toFixed(1) + ' MB')

/* ZIP 本地文件头 PK\x03\x04 */
const sig = Buffer.from([0x50, 0x4b, 0x03, 0x04])
let start = -1
let count = 0
for (let i = 0; i < buf.length - 4; i++) {
  if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x03 && buf[i + 3] === 0x04) {
    /* 验证后面能读出文件名长度合理 */
    const nameLen = buf.readUInt16LE(i + 26)
    if (nameLen > 0 && nameLen < 512) { start = i; count++; break }
  }
}
console.log('找到 ZIP 起点: 偏移 ' + start)

if (start < 0) { console.log('未找到 payload'); process.exit(1) }

/* 找结束标记 PK\x05\x06 */
const eocd = Buffer.from([0x50, 0x4b, 0x05, 0x06])
let end = buf.length
for (let i = buf.length - 22; i >= start; i--) {
  if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x05 && buf[i + 3] === 0x06) {
    const commentLen = buf.readUInt16LE(i + 20)
    end = i + 22 + commentLen
    break
  }
}
console.log('ZIP 结束: 偏移 ' + end + ' (payload 大小 ' + ((end - start) / 1048576).toFixed(1) + ' MB)')

const out = path.join('build', 'extracted-payload.zip')
fs.mkdirSync('build', { recursive: true })
fs.writeFileSync(out, buf.slice(start, end))
console.log('已提取到 ' + out)

/* 用 tar 列出内容（Windows 自带） */
const { execSync } = require('node:child_process')
try {
  const list = execSync('tar.exe -tf "' + out + '"', { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 })
  const lines = list.trim().split('\n').filter((l) => l && !l.endsWith('/'))
  console.log('\npayload 内文件数: ' + lines.length)

  const groups = {}
  for (const l of lines) {
    const top = l.replace(/^\.\//, '').split('/')[0]
    groups[top] = (groups[top] || 0) + 1
  }
  console.log('\n按顶层目录统计:')
  Object.entries(groups).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
    console.log('  ' + k.padEnd(20) + v + ' 个文件')
  })

  console.log('\n关键文件检查:')
  const need = ['app/server.js', 'public/app.js', 'public/style.css', 'public/index.html', '留声.exe', 'runtime/node.exe', 'sources']
  for (const n of need) {
    const hit = lines.some((l) => l.includes(n))
    console.log('  ' + (hit ? 'OK  ' : '缺失') + ' ' + n)
  }
} catch (e) {
  console.log('列出失败: ' + e.message)
}
