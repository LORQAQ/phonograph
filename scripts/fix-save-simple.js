'use strict'
/* save=1 简化：只下载原文件写盘，不做 ffmpeg 转码（转码曾把服务搞崩） */
const fs = require('node:fs')
const p = 'app/server.js'
let s = fs.readFileSync(p, 'utf8')

const start = s.indexOf('    /* save=1：直接存到下载目录，不弹浏览器另存为 */')
if (start < 0) { console.log('未找到 save=1'); process.exit(1) }
const endMark = '    const filename = baseName + guessExt'
const end = s.indexOf(endMark, start)
if (end < 0) { console.log('未找到结束'); process.exit(1) }

const impl = `    /* save=1：直接存到下载目录（不转码，避免 ffmpeg 大文件把进程拖垮） */
    if (q.get('save') === '1') {
      const wantFmt = q.get('format') === 'flac' ? 'flac' : 'mp3'
      const dir = db.settings.downloadDir || defaultDownloadDir()
      try { fs.mkdirSync(dir, { recursive: true }) } catch (e) { }
      try {
        const resp = await fetch(result.url, {
          headers: { 'User-Agent': UA, Referer: refererFor(result.url), Accept: '*/*' },
        })
        if (!resp.ok) return json(res, 502, { error: '音频源返回 ' + resp.status })
        const buf = Buffer.from(await resp.arrayBuffer())
        if (buf.length < 4096) return json(res, 502, { error: '音频内容为空' })
        const rawFmt = transcoder.sniffFormat(buf)
        const outName = baseName + '.' + (rawFmt === 'unknown' ? wantFmt : rawFmt)
        const outPath = path.join(dir, outName)
        try {
          if (fs.existsSync(outPath)) fs.unlinkSync(outPath)
          fs.writeFileSync(outPath, buf)
        } catch (e) {
          return json(res, 500, { error: '写入失败：' + e.message })
        }
        return json(res, 200, { ok: true, path: outPath, size: buf.length, name: outName })
      } catch (e) {
        return json(res, 502, { error: '下载失败：' + (e.message || e) })
      }
    }

`

s = s.slice(0, start) + impl + s.slice(end)

/* 打开目录改用 spawn，更可靠 */
s = s.replace(
  "      try { require('node:child_process').exec('explorer \"' + dir + '\"') } catch (e) { }",
  `      try {
        require('node:fs').mkdirSync(dir, { recursive: true })
        const { spawn } = require('node:child_process')
        const child = spawn('explorer.exe', [dir], { detached: true, stdio: 'ignore' })
        child.unref()
      } catch (e) { }`
)

fs.writeFileSync(p, s, 'utf8')
console.log('save=1 已简化（不转码）')
console.log('explorer 已改 spawn:', s.includes("spawn('explorer.exe'"))
