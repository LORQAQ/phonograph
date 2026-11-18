'use strict'
/* 下载：总是先取到完整文件（fetch 自动跟随重定向），再用 ffmpeg 转成目标格式 */
const fs = require('node:fs')
const p = 'app/server.js'
let s = fs.readFileSync(p, 'utf8')

const start = s.indexOf('    /* 统一成用户选的格式：m4a/ogg 等先下到临时文件，用 ffmpeg 转成 mp3 或 flac */')
if (start < 0) { console.log('未找到转码块'); process.exit(1) }
const endMark = '    const filename = baseName + (srcFmt !== \'unknown\' ? \'.\' + srcFmt : \'.mp3\')'
const end = s.indexOf(endMark, start)
if (end < 0) { console.log('未找到结束'); process.exit(1) }

const impl = `    /* 统一格式：先抓完整文件（自动跟随重定向），再 ffmpeg 转成 mp3 / flac */
    const wantFmt = q.get('format') === 'flac' ? 'flac' : 'mp3'
    const baseName = (info.name + ' - ' + info.singer).replace(/[\\\\/:*?"<>|]/g, '_').slice(0, 80)
    try {
      if (fs.existsSync(FFMPEG_BIN)) {
        const os = require('node:os')
        const pathMod = require('node:path')
        const tmpDir = fs.mkdtempSync(pathMod.join(os.tmpdir(), 'ls-'))
        const srcFile = pathMod.join(tmpDir, 'src.bin')
        const outFile = pathMod.join(tmpDir, 'out.' + wantFmt)

        const resp = await fetch(result.url, { headers: { 'User-Agent': UA, Referer: refererFor(result.url) } })
        if (!resp.ok) throw new Error('源返回 ' + resp.status)
        const buf = Buffer.from(await resp.arrayBuffer())
        if (buf.length < 4096) throw new Error('内容为空')
        fs.writeFileSync(srcFile, buf)

        const ok = transcodeAudio(srcFile, wantFmt, outFile)
        if (ok) {
          const outName = baseName + '.' + wantFmt
          const st2 = fs.statSync(outFile)
          res.writeHead(200, {
            'Content-Type': wantFmt === 'flac' ? 'audio/flac' : 'audio/mpeg',
            'Content-Length': st2.size,
            'Content-Disposition': 'attachment; filename="' + encodeURIComponent(outName) + '"; filename*=UTF-8\\'\\'' + encodeURIComponent(outName),
          })
          fs.createReadStream(outFile).pipe(res)
          return null
        }
        /* 转码失败：直接把原文件给出去（至少能听） */
        const rawExt = buf[0] === 0x49 ? '.mp3' : buf.slice(4, 8).toString() === 'ftyp' ? '.m4a' : '.bin'
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': buf.length,
          'Content-Disposition': 'attachment; filename="' + encodeURIComponent(baseName + rawExt) + '"',
        })
        res.end(buf)
        return null
      }
    } catch (e) { }

`

s = s.slice(0, start) + impl + s.slice(end + endMark.length)
fs.writeFileSync(p, s, 'utf8')
console.log('下载流程已重写（fetch + ffmpeg）')
