'use strict'
/* 检查安装包内 payload.zip 的条目名编码与 UTF-8 标志位 */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

const exe = '留声-1.0.28-安装包.exe'
if (!fs.existsSync(exe)) { console.log('安装包不存在'); process.exit(1) }

const b = fs.readFileSync(exe)
const sig = Buffer.from([0x50, 0x4b, 0x03, 0x04])
const idx = b.indexOf(sig)
if (idx < 0) { console.log('找不到 zip 头'); process.exit(1) }
console.log('zip 起点偏移: ' + idx)

/* 扫描本地文件头（PK\x03\x04），解析文件名与 flag */
console.log('\n=== 本地文件头（前 5 个）===')
let p = idx
let n = 0
while (p < b.length - 4 && n < 5) {
  if (b[p] !== 0x50 || b[p + 1] !== 0x4b || b[p + 2] !== 0x03 || b[p + 3] !== 0x04) break
  const flags = b.readUInt16LE(p + 6)
  const method = b.readUInt16LE(p + 8)
  const nameLen = b.readUInt16LE(p + 26)
  const extraLen = b.readUInt16LE(p + 28)
  const nameBuf = b.slice(p + 30, p + 30 + nameLen)
  const compressed = b.readUInt32LE(p + 18)

  /* 判断名字是不是 UTF-8 合法 */
  const asUtf8 = nameBuf.toString('utf8')
  const asLatin1 = nameBuf.toString('latin1')
  const utf8Bit = (flags & 0x0800) !== 0

  console.log('--- 条目 ' + (n + 1) + ' ---')
  console.log('  flags      = 0x' + flags.toString(16).padStart(4, '0') + (utf8Bit ? '  [UTF-8 位已置]' : '  [UTF-8 位未置]'))
  console.log('  method     = ' + method)
  console.log('  原始字节   = ' + nameBuf.toString('hex').slice(0, 60))
  console.log('  按 UTF-8   = ' + JSON.stringify(asUtf8))
  console.log('  按 latin1  = ' + JSON.stringify(asLatin1))

  /* 中文名的条目重点看 */
  if (/[^\x00-\x7F]/.test(asUtf8) || nameBuf.some((x) => x > 127)) {
    /* 判断是 GBK 还是 UTF-8：GBK 的「留」= C1 F4，UTF-8 = E7 95 99 */
    const hex = nameBuf.toString('hex')
    if (hex.includes('c1f4')) console.log('  ⚠ 检测到 GBK 字节（C1 F4 = 留），非 UTF-8')
    else if (hex.includes('e795')) console.log('  ✓ 检测到 UTF-8 字节（E7 95 99 = 留）')
  }

  p += 30 + nameLen + extraLen + compressed
  n++
}

/* 找中央目录，检查所有中文条目 */
console.log('\n=== 中央目录里的中文条目 ===')
const cdSig = Buffer.from([0x50, 0x4b, 0x01, 0x02])
let cn = 0
let ccn = 0
for (let i = idx; i < b.length - 4; i++) {
  if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 0x01 && b[i + 3] === 0x02) {
    cn++
    const flags = b.readUInt16LE(i + 8)
    const nameLen = b.readUInt16LE(i + 28)
    const nameBuf = b.slice(i + 46, i + 46 + nameLen)
    const utf8Bit = (flags & 0x0800) !== 0
    const hasNonAscii = nameBuf.some((x) => x > 127)
    if (hasNonAscii) {
      ccn++
      if (ccn <= 6) {
        console.log('  ' + JSON.stringify(nameBuf.toString('utf8')).padEnd(30) +
          ' flags=0x' + flags.toString(16).padStart(4, '0') +
          (utf8Bit ? ' UTF8位✓' : ' UTF8位✗') +
          ' hex=' + nameBuf.toString('hex').slice(0, 24))
      }
    }
  }
}
console.log('\n  中央目录条目总数: ' + cn + '，其中非 ASCII 名: ' + ccn)

/* 结论 */
console.log('\n=== 结论 ===')
const sample = (() => {
  for (let i = idx; i < b.length - 4; i++) {
    if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 0x01 && b[i + 3] === 0x02) {
      const flags = b.readUInt16LE(i + 8)
      const nameLen = b.readUInt16LE(i + 28)
      const nameBuf = b.slice(i + 46, i + 46 + nameLen)
      if (nameBuf.some((x) => x > 127)) return { flags, nameBuf }
    }
  }
  return null
})()
if (!sample) console.log('  没有中文条目（不可能）')
else {
  const utf8Bit = (sample.flags & 0x0800) !== 0
  const hex = sample.nameBuf.toString('hex')
  const isGbk = hex.includes('c1f4') || hex.includes('c1f9')
  console.log('  中文条目 UTF-8 标志: ' + (utf8Bit ? '✓ 已置（安全）' : '✗ 未置（非 936 系统会乱码）'))
  console.log('  实际字节: ' + (isGbk ? 'GBK' : (utf8Bit ? 'UTF-8' : '未知')))
}