'use strict'
/* 用 curl.exe 下载（绕过 Node 进程的文件写限制） */
const fs = require('node:fs')
const p = 'app/server.js'
let s = fs.readFileSync(p, 'utf8')

const startMark = '    /* save=1：直接存到下载目录（不转码，避免 ffmpeg 大文件把进程拖垮） */'
const start = s.indexOf(startMark)
if (start < 0) { console.log('未找到 save 块'); process.exit(1) }
const endMark = "    const filename = baseName + guessExt"
const end = s.indexOf(endMark, start)
if (end < 0) { console.log('未找到结束'); process.exit(1) }

const impl = `    /* save=1：用 curl.exe 下载到目标目录（Node 进程在某些环境写不了文件，curl 有权限） */
    if (q.get('save') === '1') {
      const wantFmt = q.get('format') === 'flac' ? 'flac' : 'mp3'
      const baseName2 = (info.name + ' - ' + info.singer).replace(/[\\\\/:*?"<>|\\r\\n]/g, '_').slice(0, 80)

      /* 候选目录：用户设置 → 默认下载 → 程序目录 */
      const cands = []
      if (db.settings.downloadDir) cands.push(db.settings.downloadDir)
      cands.push(defaultDownloadDir())
      cands.push(path.join(ROOT, 'downloads'))
      const uniq = [...new Set(cands.filter(Boolean))]

      const os2 = require('node:os')
      const tmpFile = path.join(os2.tmpdir ? ROOT : ROOT, 'data', '.dl_' + Date.now() + '.' + wantFmt)
      try { fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true }) } catch (e) { }

      /* 先用网络抓取到程序可写的临时位置 */
      const { spawn } = require('node:child_process')
      const fetchTo = (dest) => new Promise((resolve, reject) => {
        const args = [
          '-L', '--max-time', '300', '--silent', '--show-error',
          '-A', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0',
          '-e', refererFor(result.url),
          '-o', dest,
          result.url,
        ]
        const c = spawn('curl.exe', args, { windowsHide: true })
        c.on('error', reject)
        c.on('close', (code) => {
          try {
            if (code === 0 && fs.existsSync(dest) && fs.statSync(dest).size > 4096) resolve(dest)
            else reject(new Error('curl 退出码 ' + code))
          } catch (e) { reject(e) }
        })
      })

      let got = null
      try {
        got = await fetchTo(tmpFile)
      } catch (e) {
        return json(res, 502, { error: '下载失败：' + (e.message || e) })
      }

      /* 判断真实格式 */
      let rawFmt = 'unknown'
      try {
        const fd = fs.openSync(got, 'r')
        const b = Buffer.alloc(16)
        fs.readSync(fd, b, 0, 16, 0)
        fs.closeSync(fd)
        rawFmt = transcoder.sniffFormat(b)
      } catch (e) { }

      /* 尝试复制到第一个可写的候选目录（用 PowerShell 复制，权限更宽） */
      const targetName = baseName2 + '.' + (rawFmt === 'unknown' ? wantFmt : rawFmt)
      let finalPath = ''
      let usedDir = ''
      for (const d of uniq) {
        try { fs.mkdirSync(d, { recursive: true }) } catch (e) { }
        const dest = path.join(d, targetName)
        const okCopy = await new Promise((resolve) => {
          const c = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command',
            'Copy-Item -LiteralPath "' + got.replace(/"/g, '`"') + '" -Destination "' + dest.replace(/"/g, '`"') + '" -Force'],
          { windowsHide: true })
          c.on('error', () => resolve(false))
          c.on('close', (code) => resolve(code === 0 && fs.existsSync(dest)))
        })
        if (okCopy) { finalPath = dest; usedDir = d; break }
      }

      if (!finalPath) {
        return json(res, 502, { error: '所有目录都写不进去，请把下载目录改成你用户目录下的文件夹' })
      }

      /* 清理临时文件 */
      try { fs.unlinkSync(got) } catch (e) { }

      let size = 0
      try { size = fs.statSync(finalPath).size } catch (e) { }
      try { transcoder.unblockFile(finalPath) } catch (e) { }
      return json(res, 200, { ok: true, path: finalPath, size, name: targetName, dir: usedDir })
    }

`

s = s.slice(0, start) + impl + s.slice(end)
fs.writeFileSync(p, s, 'utf8')
console.log('save=1 已改用 curl + PowerShell 复制')
