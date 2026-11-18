'use strict'
/* /api/download：源格式与目标不符时，先用 ffmpeg 转码再返回（浏览器下载统一 mp3/flac） */
const fs = require('node:fs')
const p = 'app/server.js'
let s = fs.readFileSync(p, 'utf8')

/* 在 proxyStream 调用前插入"格式统一"逻辑 */
const marker = '    proxyStream(req, res, result.url, { filename })'
if (!s.includes('/* 格式统一：源不是目标格式时先转码')) {
  const injection = `    /* 格式统一：源不是目标格式时先转码再返回，保证下载下来一定是 mp3 或 flac */
    try {
      const wantFmt = q.get('format') === 'flac' ? 'flac' : 'mp3'
      const srcUrl = String(result.url).toLowerCase()
      const srcFmt = /\\.flac(\\?|$)/.test(srcUrl) ? 'flac'
        : /\\.mp3(\\?|$)/.test(srcUrl) ? 'mp3'
        : /\\.(m4a|mp4|aac)(\\?|$)/.test(srcUrl) ? 'm4a'
        : /\\.ogg(\\?|$)/.test(srcUrl) ? 'ogg' : 'unknown'
      if (srcFmt !== 'unknown' && srcFmt !== wantFmt && fs.existsSync(FFMPEG_BIN)) {
        const pathMod2 = require('node:path')
        const os = require('node:os')
        const tmpDir = fs.mkdtempSync(pathMod2.join(os.tmpdir(), 'liusheng-'))
        const srcFile = pathMod2.join(tmpDir, 'src.' + srcFmt)
        const outFile = pathMod2.join(tmpDir, 'out.' + wantFmt)
        /* 先完整下载 */
        await new Promise((resolve, reject) => {
          const u5 = new URL(result.url)
          const mod5 = u5.protocol === 'https:' ? https : http
          const req5 = mod5.get(u5, {
            headers: { 'User-Agent': UA, Referer: refererFor(result.url), Accept: '*/*' },
            timeout: 60000,
          }, (r5) => {
            if (r5.statusCode >= 400) { r5.resume(); return reject(new Error('源返回 ' + r5.statusCode)) }
            r5.pipe(fs.createWriteStream(srcFile)).on('finish', resolve).on('error', reject)
          })
          req5.on('error', reject)
          req5.on('timeout', () => req5.destroy(new Error('超时')))
        })
        const ok = transcodeAudio(srcFile, wantFmt, outFile)
        if (ok) {
          const newName = (info.name + ' - ' + info.singer).replace(/[\\\\/:*?"<>|\\r\\n]/g, '_').slice(0, 80) + '.' + wantFmt
          const stat2 = fs.statSync(outFile)
          res.writeHead(200, {
            'Content-Type': wantFmt === 'flac' ? 'audio/flac' : 'audio/mpeg',
            'Content-Length': stat2.size,
            'Content-Disposition': 'attachment; filename="' + encodeURIComponent(newName) + '"; filename*=UTF-8\\'\\'' + encodeURIComponent(newName),
          })
          fs.createReadStream(outFile).pipe(res)
          return null
        }
        try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch (e) { }
      }
    } catch (e) { }

`
  s = s.replace(marker, injection + marker)
}

fs.writeFileSync(p, s, 'utf8')
console.log('下载转码已接入:', s.includes('/* 格式统一'))
