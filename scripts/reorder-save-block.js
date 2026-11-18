'use strict'
/* 把 save=1 块移到「转码/直发」之前，否则永远走不到 */
const fs = require('node:fs')
const p = 'app/server.js'
let s = fs.readFileSync(p, 'utf8')

/* 1) 截取 save=1 块 */
const startMark = '    /* save=1：直接存到下载目录（不转码，避免 ffmpeg 大文件把进程拖垮） */'
const start = s.indexOf(startMark)
if (start < 0) { console.log('未找到 save=1 块'); process.exit(1) }
const endMark = '    const filename = baseName + guessExt'
const end = s.indexOf(endMark, start)
if (end < 0) { console.log('未找到结束'); process.exit(1) }

const block = s.slice(start, end)
s = s.slice(0, start) + s.slice(end)

/* 2) 插到「统一格式：先抓完整文件」之前（也就是所有转码/转发的开头） */
const anchor = s.indexOf('    /* 统一格式：先抓完整文件')
if (anchor < 0) {
  /* 没有那个块就插到 const baseName 之后 */
  const a2 = s.indexOf('    const baseName = ')
  if (a2 < 0) { console.log('未找到插入点'); process.exit(1) }
  const lineEnd = s.indexOf('\n', a2) + 1
  s = s.slice(0, lineEnd) + '\n' + block + s.slice(lineEnd)
  console.log('已插入到 baseName 之后')
} else {
  s = s.slice(0, anchor) + block + s.slice(anchor)
  console.log('已插入到转码块之前')
}

fs.writeFileSync(p, s, 'utf8')

/* 3) 校验顺序 */
const a = s.indexOf("q.get('save') === '1'")
const b = s.indexOf('proxyStream(req, res, result.url, { filename })')
const c = s.indexOf('统一格式')
console.log('save=1 位置:', a, '| 转码位置:', c, '| proxyStream:', b)
console.log('顺序正确:', a > 0 && a < b)
