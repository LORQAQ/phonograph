'use strict'
/* 重写 save=1 分支：用 pipeline 写文件，带超时与错误兜底 */
const fs = require('node:fs')
const p = 'app/server.js'
let s = fs.readFileSync(p, 'utf8')

const start = s.indexOf("    /* save=1：后端直接写入下载目录，不弹浏览器另存为 */")
if (start < 0) { console.log('未找到 save=1 块'); process.exit(1) }
const endMark = "      })\n    }"
const end = s.indexOf(endMark, start)
if (end < 0) { console.log('未找到结束标记'); process.exit(1) }

const impl = `    /* save=1：后端直接写入下载目录，不弹浏览器另存为 */
    if (q.get('save') === '1') {
      const pathMod = require('node:path')
      const { pipeline } = require('node:stream/promises')
      const dir = db.settings.downloadDir || defaultDownloadDir()
      try { fs.mkdirSync(dir, { recursive: true }) } catch (e) { }
      const full = pathMod.join(dir, filename)
      const tmp = full + '.part'
      const u3 = new URL(result.url)
      const mod3 = u3.protocol === 'https:' ? https : http

      try {
        await new Promise((resolve, reject) => {
          const req3 = mod3.get(u3, {
            headers: { 'User-Agent': UA, Referer: refererFor(result.url), Accept: '*/*' },
            timeout: 45000,
          }, (r3) => {
            if (r3.statusCode >= 400) { r3.resume(); return reject(new Error('音频源返回 ' + r3.statusCode)) }
            const ct3 = String(r3.headers['content-type'] || '').toLowerCase()
            if (ct3.includes('text/html') || ct3.includes('application/json')) {
              r3.resume()
              return reject(new Error('该音频地址已失效'))
            }
            pipeline(r3, fs.createWriteStream(tmp)).then(resolve).catch(reject)
          })
          req3.on('error', reject)
          req3.on('timeout', () => { req3.destroy(new Error('下载超时')) })
        })

        const st = fs.statSync(tmp)
        if (st.size < 4096) {
          try { fs.unlinkSync(tmp) } catch (e) {}
          return json(res, 502, { error: '音频内容为空，已取消' })
        }
        fs.renameSync(tmp, full)
        return json(res, 200, { ok: true, path: full, size: st.size, name: filename })
      } catch (e) {
        try { fs.unlinkSync(tmp) } catch (x) {}
        return json(res, 502, { error: '下载失败：' + (e.message || e) })
      }
    }`

s = s.slice(0, start) + impl + s.slice(end + endMark.length)
fs.writeFileSync(p, s, 'utf8')
console.log('save=1 已重写:', s.includes('stream/promises'))
