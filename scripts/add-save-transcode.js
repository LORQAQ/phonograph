'use strict'
/* 下载统一格式：save=1 里加回 ffmpeg 转码（用 spawn 异步 + 超时，避免阻塞/崩溃） */
const fs = require('node:fs')
const p = 'app/server.js'
let s = fs.readFileSync(p, 'utf8')

/* 1) transcoder 加一个异步转码（spawn + 超时） */
const tp = 'app/lib/transcode.js'
let t = fs.readFileSync(tp, 'utf8')
if (!t.includes('transcodeAsync')) {
  t = t.replace(
    'module.exports = {',
    `/** 异步转码（spawn + 超时），返回 Promise<boolean> */
function transcodeAsync (srcFile, targetFormat, outFile, timeoutMs = 180000) {
  return new Promise((resolve) => {
    if (!available()) return resolve(false)
    if (!fs.existsSync(srcFile)) return resolve(false)
    const args = targetFormat === 'flac'
      ? ['-y', '-i', srcFile, '-vn', '-c:a', 'flac', '-compression_level', '5', outFile]
      : ['-y', '-i', srcFile, '-vn', '-c:a', 'libmp3lame', '-b:a', '320k', outFile]
    const { spawn } = require('node:child_process')
    let done = false
    const child = spawn(FFMPEG_BIN, args, { windowsHide: true, stdio: 'ignore' })
    const timer = setTimeout(() => {
      if (done) return
      done = true
      try { child.kill('SIGKILL') } catch (e) { }
      resolve(false)
    }, timeoutMs)
    child.on('error', () => { if (!done) { done = true; clearTimeout(timer); resolve(false) } })
    child.on('close', (code) => {
      if (done) return
      done = true
      clearTimeout(timer)
      try {
        resolve(code === 0 && fs.existsSync(outFile) && fs.statSync(outFile).size > 4096)
      } catch (e) { resolve(false) }
    })
  })
}

module.exports = { transcodeAsync,`
  )
  fs.writeFileSync(tp, t, 'utf8')
  console.log('transcodeAsync 已加')
}

/* 2) save=1：需要转码就转 */
const oldBlock = `        const rawFmt = transcoder.sniffFormat(buf)
        const outName = baseName + '.' + (rawFmt === 'unknown' ? wantFmt : rawFmt)
        const outPath = path.join(dir, outName)
        try {
          if (fs.existsSync(outPath)) fs.unlinkSync(outPath)
          fs.writeFileSync(outPath, buf)
        } catch (e) {
          return json(res, 500, { error: '写入失败：' + e.message })
        }
        return json(res, 200, { ok: true, path: outPath, size: buf.length, name: outName })`

const newBlock = `        const rawFmt = transcoder.sniffFormat(buf)
        const outName = baseName + '.' + wantFmt
        const outPath = path.join(dir, outName)
        try {
          if (fs.existsSync(outPath)) fs.unlinkSync(outPath)
        } catch (e) { }

        /* 源格式与目标不同 → 用 ffmpeg 转，保证双击能播 */
        if (rawFmt !== 'unknown' && rawFmt !== wantFmt && transcoder.available()) {
          const work = fs.mkdtempSync(path.join(ROOT, 'data', 'ls-'))
          const srcFile = path.join(work, 'src.' + rawFmt)
          const outFile = path.join(work, 'out.' + wantFmt)
          try { fs.writeFileSync(srcFile, buf) } catch (e) { }
          const okConv = await transcoder.transcodeAsync(srcFile, wantFmt, outFile)
          try { fs.rmSync(work, { recursive: true, force: true }) } catch (e) { }
          if (okConv) {
            try {
              fs.copyFileSync(outFile, outPath)
              const st2 = fs.statSync(outPath)
              return json(res, 200, { ok: true, path: outPath, size: st2.size, name: outName, converted: rawFmt + '→' + wantFmt })
            } catch (e) {
              return json(res, 500, { error: '写入失败：' + e.message })
            }
          }
          /* 转码失败就按原格式存，别让用户啥也拿不到 */
          const fallbackName = baseName + '.' + (rawFmt === 'unknown' ? wantFmt : rawFmt)
          const fallbackPath = path.join(dir, fallbackName)
          try {
            fs.writeFileSync(fallbackPath, buf)
            return json(res, 200, { ok: true, path: fallbackPath, size: buf.length, name: fallbackName, converted: 'none' })
          } catch (e) {
            return json(res, 500, { error: '写入失败：' + e.message })
          }
        }

        try {
          fs.writeFileSync(outPath, buf)
        } catch (e) {
          return json(res, 500, { error: '写入失败：' + e.message })
        }
        return json(res, 200, { ok: true, path: outPath, size: buf.length, name: outName })`

if (s.includes(oldBlock)) {
  s = s.replace(oldBlock, newBlock)
  fs.writeFileSync(p, s, 'utf8')
  console.log('save=1 已加回转码')
} else {
  console.log('未匹配 save=1 块，当前片段：')
  const i = s.indexOf("q.get('save') === '1'")
  console.log(s.slice(i, i + 900))
}
