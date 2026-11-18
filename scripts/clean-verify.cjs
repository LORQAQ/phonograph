'use strict'
/* 清理旧包 + 验证新包 */
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

const desk = path.join(os.homedir(), 'Desktop')

/* 1) 删旧包 */
const old = ['留声-1.0.0-安装包.exe', '留声.apk', '留声.lnk', '留声.exe', '留声-便携版']
for (const f of old) {
  const p = path.join(desk, f)
  try {
    if (fs.existsSync(p)) {
      const st = fs.statSync(p)
      if (st.isDirectory()) fs.rmSync(p, { recursive: true, force: true })
      else fs.unlinkSync(p)
      console.log('删除 ' + f)
    }
  } catch (e) { }
}

/* 2) 桌面最终 */
console.log('\n=== 桌面留声相关 ===')
for (const f of fs.readdirSync(desk)) {
  if (f.startsWith('留声')) {
    const st = fs.statSync(path.join(desk, f))
    console.log('  ' + f.padEnd(28) + (st.size / 1048576).toFixed(2) + ' MB  ' + st.mtime.toLocaleString())
  }
}

/* 3) 验证 APK */
const apk = path.join(desk, '留声-1.0.1.apk')
if (fs.existsSync(apk)) {
  const b = fs.readFileSync(apk)
  console.log('\n=== APK 校验 ===')
  console.log('  大小    ' + (b.length / 1024).toFixed(0) + ' KB')
  console.log('  ZIP 头  ' + (b[0] === 0x50 && b[1] === 0x4b))
  const sd = fs.readFileSync('mobile/www/sources-data.js', 'utf8')
  const ids = [...sd.matchAll(/"id":"([^"]+)"/g)].map((m) => m[1])
  console.log('  音源    ' + ids.length + ' 个: ' + ids.join(', '))
}

/* 4) 验证安装包 */
const setup = path.join(desk, '留声-1.0.1-安装包.exe')
if (fs.existsSync(setup)) {
  const b = fs.readFileSync(setup)
  console.log('\n=== 安装包校验 ===')
  console.log('  大小       ' + (b.length / 1048576).toFixed(1) + ' MB')
  console.log('  MZ 头      ' + (b[0] === 0x4d && b[1] === 0x5a))
  console.log('  内嵌 zip   ' + (b.includes(Buffer.from('payload.zip'))))
}
