'use strict'
/**
 * 生成安装包 payload.zip —— 强制 UTF-8 文件名 + 置 UTF-8 标志位（bit 11）
 *
 * 为什么不用 tar.exe / Compress-Archive：
 *   这两个都按系统 ANSI 代码页（中文系统 = GBK）写条目名，且不置 bit 11。
 *   .NET 的 ZipArchive 在标志位未置时按 Encoding.Default 解码，
 *   于是非 936 的 Windows（英文/日文/韩文）解出来是乱码文件名，
 *   快捷方式指向不存在的 "????.exe" → 用户装完打不开。
 *
 * 用法：node make-payload-zip.cjs <源目录> <输出.zip>
 */
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

/* ---------- CRC32 ---------- */
let crcTable = null
function makeCrcTable () {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    t[n] = c
  }
  return t
}
function crc32 (buf) {
  if (typeof zlib.crc32 === 'function') return zlib.crc32(buf) >>> 0
  if (!crcTable) crcTable = makeCrcTable()
  let c = 0 ^ (-1)
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ crcTable[(c ^ buf[i]) & 0xFF]
  return (c ^ (-1)) >>> 0
}

/* ---------- 收集文件 ---------- */
function walk (dir, base) {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name)
    const rel = base ? base + '/' + e.name : e.name
    if (e.isDirectory()) {
      out.push({ name: rel + '/', dir: true })
      out.push(...walk(abs, rel))
    } else {
      out.push({ name: rel, abs, dir: false })
    }
  }
  return out
}

/* DOS 时间 */
function dosTime (d) {
  const t = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((Math.floor(d.getSeconds() / 2)) & 31)
  const dt = (((d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31)
  return { t, dt }
}

function build (srcDir, outFile) {
  const entries = walk(srcDir, '')
  const now = new Date()
  const { t: dosT, dt: dosD } = dosTime(now)

  const localParts = []
  const centralParts = []
  let offset = 0

  for (const e of entries) {
    /* 关键：UTF-8 编码名字，并置 bit 11 */
    const nameBuf = Buffer.from(e.name, 'utf8')
    const FLAG = 0x0800            /* UTF-8 */
    let data = Buffer.alloc(0)
    let method = 0
    let comp = Buffer.alloc(0)
    let crc = 0
    let uncompSize = 0

    if (!e.dir) {
      data = fs.readFileSync(e.abs)
      uncompSize = data.length
      crc = crc32(data)
      if (data.length > 0) {
        const deflated = zlib.deflateRawSync(data, { level: 9 })
        if (deflated.length < data.length) {
          method = 8
          comp = deflated
        } else {
          method = 0
          comp = data
        }
      } else {
        method = 0
        comp = data
      }
    }

    /* ---- 本地文件头 ---- */
    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0)
    lh.writeUInt16LE(20, 4)          /* version needed */
    lh.writeUInt16LE(FLAG, 6)
    lh.writeUInt16LE(method, 8)
    lh.writeUInt16LE(dosT, 10)
    lh.writeUInt16LE(dosD, 12)
    lh.writeUInt32LE(crc, 14)
    lh.writeUInt32LE(comp.length, 18)
    lh.writeUInt32LE(uncompSize, 22)
    lh.writeUInt16LE(nameBuf.length, 26)
    lh.writeUInt16LE(0, 28)          /* extra len */

    localParts.push(lh, nameBuf, comp)

    /* ---- 中央目录项 ---- */
    const cd = Buffer.alloc(46)
    cd.writeUInt32LE(0x02014b50, 0)
    cd.writeUInt16LE(20, 4)          /* version made by */
    cd.writeUInt16LE(20, 6)          /* version needed */
    cd.writeUInt16LE(FLAG, 8)        /* ← 中央目录也必须带 UTF-8 标志 */
    cd.writeUInt16LE(method, 10)
    cd.writeUInt16LE(dosT, 12)
    cd.writeUInt16LE(dosD, 14)
    cd.writeUInt32LE(crc, 16)
    cd.writeUInt32LE(comp.length, 20)
    cd.writeUInt32LE(uncompSize, 24)
    cd.writeUInt16LE(nameBuf.length, 28)
    cd.writeUInt16LE(0, 30)          /* extra */
    cd.writeUInt16LE(0, 32)          /* comment */
    cd.writeUInt16LE(0, 34)          /* disk start */
    cd.writeUInt16LE(0, 36)          /* internal attr */
    cd.writeUInt32LE(e.dir ? 0x10 : 0x20, 38)   /* external attr: 目录/文件 */
    cd.writeUInt32LE(offset, 42)

    centralParts.push(cd, nameBuf)
    offset += lh.length + nameBuf.length + comp.length
  }

  const centralBuf = Buffer.concat(centralParts)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(centralBuf.length, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20)

  const out = Buffer.concat([...localParts, centralBuf, eocd])
  fs.writeFileSync(outFile, out)

  return { count: entries.length, size: out.length }
}

/* ---------- 入口 ---------- */
const src = process.argv[2]
const out = process.argv[3]
if (!src || !out) {
  console.log('用法: node make-payload-zip.cjs <源目录> <输出.zip>')
  process.exit(1)
}
if (!fs.existsSync(src)) {
  console.log('源目录不存在: ' + src)
  process.exit(1)
}

const r = build(src, out)
console.log('✓ ' + out + '  ' + r.count + ' 个条目  ' + (r.size / 1048576).toFixed(2) + ' MB')

/* ---------- 自检：回读确认 UTF-8 标志 ---------- */
const b = fs.readFileSync(out)
let okUtf8 = 0
let badUtf8 = 0
const badNames = []
for (let i = 0; i < b.length - 4; i++) {
  if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 0x01 && b[i + 3] === 0x02) {
    const flags = b.readUInt16LE(i + 8)
    const nameLen = b.readUInt16LE(i + 28)
    const nameBuf = b.slice(i + 46, i + 46 + nameLen)
    const hasNonAscii = nameBuf.some((x) => x > 127)
    if (hasNonAscii) {
      if (flags & 0x0800) okUtf8++
      else { badUtf8++; badNames.push(nameBuf.toString('utf8')) }
    }
  }
}
console.log('  中文条目: UTF-8 标志已置 ' + okUtf8 + ' 个，未置 ' + badUtf8 + ' 个')
if (badUtf8 > 0) {
  console.log('  ✗ 仍有未置标志的: ' + badNames.slice(0, 5).join(', '))
  process.exit(1)
}
console.log('  ✓ 全部中文条目已置 UTF-8 标志')