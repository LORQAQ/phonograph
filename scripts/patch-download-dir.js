'use strict'
/* 电脑端下载：后端直接存盘 + 可配置下载目录 + 只允许 mp3/flac */
const fs = require('node:fs')

let s = fs.readFileSync('app/server.js', 'utf8')

/* ---------- 1) 下载目录设置 + 打开文件夹接口 ---------- */
if (!s.includes('downloadDir')) {
  s = s.replace(
    "  async '/api/download' (req, q, res) {",
    `  /* 下载目录：读取 / 设置 / 打开 */
  async '/api/download-dir' (req, q) {
    if (q.get('open')) {
      try {
        require('node:child_process').exec('explorer "' + String(db.settings.downloadDir || defaultDownloadDir()) + '"')
      } catch (e) {}
      return { ok: true, dir: db.settings.downloadDir || defaultDownloadDir() }
    }
    const dir = q.get('set')
    if (dir) {
      try { fs.mkdirSync(dir, { recursive: true }) } catch (e) { throw Object.assign(new Error('目录不可写'), { code: 400 }) }
      db.settings.downloadDir = dir
      db.save()
    }
    return { dir: db.settings.downloadDir || defaultDownloadDir(), default: defaultDownloadDir() }
  },

  async '/api/download' (req, q, res) {`
  )

  /* 默认目录函数 */
  s = s.replace(
    'function proxyStream (req, res, targetUrl, opts = {}) {',
    `function defaultDownloadDir () {
  const home = process.env.USERPROFILE || process.env.HOME || '.'
  return require('node:path').join(home, 'Music', '留声')
}

function proxyStream (req, res, targetUrl, opts = {}) {`
  )
}

/* ---------- 2) save=1 时直接落盘 ---------- */
if (!s.includes("q.get('save')")) {
  s = s.replace(
    "    const filename = (info.name + ' - ' + info.singer).replace(/[\\\\/:*?\"<>|]/g, '_') + guessExt('', result.url)",
    `    const filename = (info.name + ' - ' + info.singer).replace(/[\\\\/:*?\"<>|]/g, '_') + guessExt('', result.url)

    /* save=1：后端直接写入下载目录，不弹浏览器另存为 */
    if (q.get('save') === '1') {
      const dir = db.settings.downloadDir || defaultDownloadDir()
      try { fs.mkdirSync(dir, { recursive: true }) } catch (e) {}
      const full = require('node:path').join(dir, filename)
      const lib2 = new URL(result.url)
      const mod2 = lib2.protocol === 'https:' ? https : http
      return await new Promise((resolve) => {
        const out = fs.createWriteStream(full)
        const up = mod2.get(lib2, { headers: { 'User-Agent': UA, Referer: refererFor(result.url), Accept: '*/*' }, timeout: 60000 }, (r) => {
          if (r.statusCode >= 400) { out.close(); try { fs.unlinkSync(full) } catch (e) {} return resolve(json(res, 502, { error: '音频源返回 ' + r.statusCode })) }
          r.pipe(out)
          out.on('finish', () => {
            if (out.bytesWritten < 4096) {
              try { fs.unlinkSync(full) } catch (e) {}
              return resolve(json(res, 502, { error: '音频内容为空，已取消' }))
            }
            resolve(json(res, 200, { ok: true, path: full, size: out.bytesWritten, name: filename }))
          })
          out.on('error', (e) => { try { fs.unlinkSync(full) } catch (x) {} resolve(json(res, 500, { error: '写入失败: ' + e.message })) })
        })
        up.on('error', (e) => { try { fs.unlinkSync(full) } catch (x) {} resolve(json(res, 502, { error: e.message })) })
      })
    }`
  )
}

fs.writeFileSync('app/server.js', s, 'utf8')
console.log('下载目录接口:', s.includes("'/api/download-dir'"))
console.log('save=1 落盘:', s.includes("q.get('save') === '1'"))
