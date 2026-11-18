'use strict'
/* 下载：优先后端直存（不弹另存为），失败才回落到浏览器下载 */
const fs = require('node:fs')

/* ---------- 后端：默认目录改到 Downloads\Liusheng，并支持 save=1 ---------- */
let s = fs.readFileSync('app/server.js', 'utf8')

/* 默认目录 */
s = s.replace(
  /function defaultDownloadDir \(\) \{[\s\S]*?\n\}/,
  `function defaultDownloadDir () {
  const home = process.env.USERPROFILE || process.env.HOME || '.'
  return path.join(home, 'Downloads', 'Liusheng')
}`
)

/* 在 /api/download 里加 save=1 分支（若没有） */
if (!s.includes("q.get('save') === '1'")) {
  const anchor = "    const filename = baseName + guessExt('', result.url)"
  const block = `    /* save=1：直接存到下载目录，不弹浏览器另存为 */
    if (q.get('save') === '1') {
      const wantFmt = q.get('format') === 'flac' ? 'flac' : 'mp3'
      const dir = db.settings.downloadDir || defaultDownloadDir()
      try { fs.mkdirSync(dir, { recursive: true }) } catch (e) { }
      try {
        const resp = await fetch(result.url, {
          headers: { 'User-Agent': UA, Referer: refererFor(result.url), Accept: '*/*' },
        })
        if (resp.ok) {
          const buf = Buffer.from(await resp.arrayBuffer())
          if (buf.length > 4096) {
            const tmpDir = path.join(ROOT, 'data')
            try { fs.mkdirSync(tmpDir, { recursive: true }) } catch (e) { }
            const work = fs.mkdtempSync(path.join(tmpDir, 'ls-'))
            const srcFile = path.join(work, 'src.bin')
            const outFile = path.join(work, 'out.' + wantFmt)
            fs.writeFileSync(srcFile, buf)
            const done = transcoder.available() ? transcoder.transcodeAudio(srcFile, wantFmt, outFile) : null
            const outPath = path.join(dir, baseName + '.' + wantFmt)
            try {
              if (done) {
                if (fs.existsSync(outPath)) fs.unlinkSync(outPath)
                fs.copyFileSync(done, outPath)
              } else {
                const rawFmt = transcoder.sniffFormat(buf)
                const rawPath = path.join(dir, baseName + '.' + (rawFmt === 'unknown' ? 'bin' : rawFmt))
                fs.writeFileSync(rawPath, buf)
                return json(res, 200, { ok: true, path: rawPath, size: buf.length, name: path.basename(rawPath) })
              }
            } catch (e) {
              return json(res, 500, { error: '写入失败: ' + e.message })
            }
            try { fs.rmSync(work, { recursive: true, force: true }) } catch (e) { }
            const st = fs.statSync(outPath)
            return json(res, 200, { ok: true, path: outPath, size: st.size, name: path.basename(outPath) })
          }
        }
      } catch (e) {
        return json(res, 502, { error: '下载失败: ' + (e.message || e) })
      }
      return json(res, 502, { error: '音频内容为空' })
    }

`
  if (s.includes(anchor)) {
    s = s.replace(anchor, block + anchor)
    console.log('save=1 分支已加')
  } else {
    console.log('未找到插入点')
  }
} else {
  console.log('save=1 已存在')
}

fs.writeFileSync('app/server.js', s, 'utf8')

/* ---------- 前端：电脑端优先直存 ---------- */
let a = fs.readFileSync('public/app.js', 'utf8')
if (!a.includes("p.set('save', '1')")) {
  const oldBlock = `  state.downloading.add(key)
  toast('开始下载：' + song.name + '（' + (state.dlFormat === 'flac' ? 'FLAC' : 'MP3') + '）', 2200)
  try {
    const p = songParams(song)
    const a = document.createElement('a')
    a.href = '/api/download?' + p.toString()
    a.download = ''
    document.body.appendChild(a)
    a.click()
    setTimeout(() => a.remove(), 1500)`
  const newBlock = `  state.downloading.add(key)
  toast('开始下载：' + song.name + '（' + (state.dlFormat === 'flac' ? 'FLAC' : 'MP3') + '）', 2200)
  try {
    const p = songParams(song)
    /* 先让后端直接存盘（不弹另存为） */
    const sp = new URLSearchParams(p.toString())
    sp.set('save', '1')
    try {
      const r = await api('/api/download?' + sp.toString())
      if (r && r.ok) {
        toast('已保存：' + r.name + '（' + (r.size / 1048576).toFixed(1) + ' MB）', 3600)
        state.downloads.unshift({ name: song.name, singer: song.singer, quality: state.quality, ts: Date.now(), path: r.path })
        state.downloads = state.downloads.slice(0, 30)
        LS.set('lx.downloads', state.downloads)
        state.downloading.delete(key)
        try { renderList && renderList() } catch (e) { }
        return
      }
    } catch (e) { /* 直存失败就回落浏览器下载 */ }
    const a = document.createElement('a')
    a.href = '/api/download?' + p.toString()
    a.download = ''
    document.body.appendChild(a)
    a.click()
    setTimeout(() => a.remove(), 1500)`
  if (a.includes(oldBlock)) {
    a = a.replace(oldBlock, newBlock)
    fs.writeFileSync('public/app.js', a, 'utf8')
    console.log('前端已改为优先直存')
  } else {
    console.log('前端块未匹配')
  }
} else {
  console.log('前端直存已存在')
}
