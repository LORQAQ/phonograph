'use strict'
/* save=1 重写：先整体读到内存 → 必要时 ffmpeg 转码 → 写盘。逻辑简单、可预期 */
const fs = require('node:fs')
const p = 'app/server.js'
let s = fs.readFileSync(p, 'utf8')

const start = s.indexOf('    /* save=1：后端直接写入下载目录，不弹浏览器另存为 */')
if (start < 0) { console.log('未找到 save=1'); process.exit(1) }
/* 结束标记：save 块之后紧接着 proxyStream( */
const endMark = '\n    proxyStream(req, res, result.url, { filename })'
const end = s.indexOf(endMark, start)
if (end < 0) { console.log('未找到 proxyStream'); process.exit(1) }

const impl = `    /* save=1：后端直接写入下载目录，并统一转成 mp3 / flac */
    if (q.get('save') === '1') {
      const pathMod = require('node:path')
      const wantFmt = q.get('format') === 'flac' ? 'flac' : 'mp3'
      const wantDir = db.settings.downloadDir
      let dir = defaultDownloadDir()
      if (wantDir) {
        try { fs.mkdirSync(wantDir, { recursive: true }); dir = wantDir } catch (e) { }
      }
      try { fs.mkdirSync(dir, { recursive: true }) } catch (e) { }

      /* 1) 整体下载到内存 */
      let buf = null
      try {
        buf = await new Promise((resolve, reject) => {
          const u4 = new URL(result.url)
          const mod4 = u4.protocol === 'https:' ? https : http
          const req4 = mod4.get(u4, {
            headers: { 'User-Agent': UA, Referer: refererFor(result.url), Accept: '*/*' },
            timeout: 60000,
          }, (r4) => {
            if (r4.statusCode >= 400) { r4.resume(); return reject(new Error('音频源返回 ' + r4.statusCode)) }
            const chunks = []
            r4.on('data', (c) => chunks.push(c))
            r4.on('end', () => resolve(Buffer.concat(chunks)))
            r4.on('error', reject)
          })
          req4.on('error', reject)
          req4.on('timeout', () => req4.destroy(new Error('下载超时')))
        })
      } catch (e) {
        return json(res, 502, { error: '下载失败：' + (e.message || e) })
      }
      if (!buf || buf.length < 4096) return json(res, 502, { error: '音频内容为空，已取消' })

      /* 2) 判断源格式 */
      const head = buf.slice(0, 16).toString('latin1')
      let srcFmt = 'other'
      if (head.startsWith('ID3') || /^\\xFF[\\xFA-\\xFF]/.test(head)) srcFmt = 'mp3'
      else if (head.slice(4, 8) === 'ftyp') srcFmt = 'm4a'
      else if (head.startsWith('fLaC')) srcFmt = 'flac'
      else if (head.startsWith('OggS')) srcFmt = 'ogg'
      else if (head.startsWith('RIFF')) srcFmt = 'wav'

      const baseName = (info.name + ' - ' + info.singer).replace(/[\\\\/:*?"<>|\\r\\n]/g, '_').slice(0, 80)
      let finalName = baseName + '.' + wantFmt
      let finalPath = pathMod.join(dir, finalName)

      /* 3) 需要转码就写临时文件交给 ffmpeg */
      if (srcFmt !== wantFmt) {
        const tmpSrc = pathMod.join(dir, baseName + '.src')
        const tmpOut = pathMod.join(dir, baseName + '.' + wantFmt)
        try { fs.writeFileSync(tmpSrc, buf) } catch (e) {
          return json(res, 500, { error: '写入临时文件失败：' + e.message })
        }
        const done = transcodeAudio(tmpSrc, wantFmt, tmpOut)
        try { fs.unlinkSync(tmpSrc) } catch (e) { }
        if (!done) return json(res, 502, { error: '转码失败（源格式：' + srcFmt + '）' })
        try { if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath) } catch (e) { }
        try { fs.renameSync(tmpOut, finalPath) } catch (e) {
          return json(res, 500, { error: '重命名失败：' + e.message })
        }
      } else {
        try { fs.writeFileSync(finalPath, buf) } catch (e) {
          return json(res, 500, { error: '写入失败：' + e.message })
        }
      }

      const size = fs.existsSync(finalPath) ? fs.statSync(finalPath).size : buf.length
      return json(res, 200, { ok: true, path: finalPath, size, name: finalName, from: srcFmt, to: wantFmt })
    }
`

s = s.slice(0, start) + impl + s.slice(end)
fs.writeFileSync(p, s, 'utf8')
console.log('save=1 已重写（内存 + 转码）')
