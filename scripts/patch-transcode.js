'use strict'
/* 下载转码：不管源给什么格式，落盘统一成用户选的 MP3(320k) 或 FLAC */
const fs = require('node:fs')
const p = 'app/server.js'
let s = fs.readFileSync(p, 'utf8')

/* 1) ffmpeg 路径常量 */
if (!s.includes('FFMPEG_BIN')) {
  s = s.replace(
    "const ROOT =",
    `const FFMPEG_BIN = require('node:path').join(__dirname, '..', 'runtime', 'bin', 'ffmpeg.exe')
const ROOT =`
  )
}

/* 2) 转码工具函数 */
if (!s.includes('function transcodeAudio')) {
  s = s.replace(
    'function longPath (p2) {',
    `/** 用 ffmpeg 把音频转成目标格式；返回输出文件路径，失败返回 null */
function transcodeAudio (srcFile, targetFormat, outFile) {
  const { execFileSync } = require('node:child_process')
  if (!fs.existsSync(FFMPEG_BIN)) return null
  const args = targetFormat === 'flac'
    ? ['-y', '-i', srcFile, '-vn', '-c:a', 'flac', '-compression_level', '5', outFile]
    : ['-y', '-i', srcFile, '-vn', '-c:a', 'libmp3lame', '-b:a', '320k', outFile]
  try {
    execFileSync(FFMPEG_BIN, args, { timeout: 180000, stdio: 'ignore', windowsHide: true })
    return fs.existsSync(outFile) && fs.statSync(outFile).size > 4096 ? outFile : null
  } catch (e) {
    return null
  }
}

function longPath (p2) {`
  )
}

/* 3) save=1 下载完成后转码 */
if (!s.includes('transcodeAudio(tmp')) {
  s = s.replace(
    `        fs.renameSync(Buffer.from(tmp, 'utf8'), Buffer.from(fullLong, 'utf8'))
        return json(res, 200, { ok: true, path: full, size: st.size, name: filename })`,
    `        fs.renameSync(Buffer.from(tmp, 'utf8'), Buffer.from(fullLong, 'utf8'))

        /* 统一成用户选择的格式：mp3 / flac */
        let finalPath = full
        let finalName = filename
        try {
          const wantFmt = q.get('format') === 'flac' ? 'flac' : 'mp3'
          const curExt = String(filename).toLowerCase().slice(String(filename).lastIndexOf('.'))
          const curFmt = curExt === '.flac' ? 'flac' : curExt === '.mp3' ? 'mp3' : 'other'
          if (curFmt !== wantFmt) {
            const outFile = full + '.' + wantFmt
            const done = transcodeAudio(full, wantFmt, outFile)
            if (done) {
              try { fs.unlinkSync(full) } catch (e) { }
              const newName = String(filename).replace(/\\.[A-Za-z0-9]+$/, '.' + wantFmt)
              const newFull = require('node:path').join(dir, newName)
              try { fs.renameSync(outFile, newFull) } catch (e) { }
              finalPath = newFull
              finalName = newName
            }
          }
        } catch (e) { }

        const finalSize = fs.existsSync(finalPath) ? fs.statSync(finalPath).size : st.size
        return json(res, 200, { ok: true, path: finalPath, size: finalSize, name: finalName })`
  )
}

fs.writeFileSync(p, s, 'utf8')
console.log('FFMPEG:', s.includes('FFMPEG_BIN'))
console.log('转码函数:', s.includes('function transcodeAudio'))
console.log('下载后转码:', s.includes('transcodeAudio(full, wantFmt'))
