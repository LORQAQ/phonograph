'use strict'
/* 用 edit 无法脚本化时的稳妥方案：整段替换 save 块 */
const fs = require('node:fs')
const p = 'app/server.js'
let s = fs.readFileSync(p, 'utf8')

const startMark = "    /* save=1：直接存到下载目录（不转码，避免 ffmpeg 大文件把进程拖垮） */"
const start = s.indexOf(startMark)
if (start < 0) { console.log('未找到'); process.exit(1) }
const endMark = "    const filename = baseName + guessExt"
const end = s.indexOf(endMark, start)
if (end < 0) { console.log('未找到结束'); process.exit(1) }

const SQ = String.fromCharCode(39)   /* ' */
const DQ = String.fromCharCode(34)   /* " */

const impl = [
  "    /* save=1：先抓到程序可写目录，再用 PowerShell 复制到目标目录（绕过 Node 写限制） */",
  "    if (q.get('save') === '1') {",
  "      const wantFmt = q.get('format') === 'flac' ? 'flac' : 'mp3'",
  "      const baseName2 = (info.name + ' - ' + info.singer).replace(/[\\\\/:*?\"<>|\\r\\n]/g, '_').slice(0, 80)",
  "",
  "      /* 1) 下载到程序目录（一定可写） */",
  "      const dataDir = path.join(ROOT, 'data')",
  "      try { fs.mkdirSync(dataDir, { recursive: true }) } catch (e) { }",
  "      const tmpFile = path.join(dataDir, '.dl_' + Date.now() + '.' + wantFmt)",
  "      try {",
  "        const resp = await fetch(result.url, {",
  "          headers: { 'User-Agent': UA, Referer: refererFor(result.url), Accept: '*/*' },",
  "        })",
  "        if (!resp.ok) return json(res, 502, { error: '音频源返回 ' + resp.status })",
  "        const buf = Buffer.from(await resp.arrayBuffer())",
  "        if (buf.length < 4096) return json(res, 502, { error: '音频内容为空' })",
  "        fs.writeFileSync(tmpFile, buf)",
  "      } catch (e) {",
  "        return json(res, 502, { error: '下载失败：' + (e.message || e) })",
  "      }",
  "",
  "      /* 2) 判断真实格式，定文件名 */",
  "      let rawFmt = 'unknown'",
  "      try {",
  "        const fd = fs.openSync(tmpFile, 'r')",
  "        const b = Buffer.alloc(16)",
  "        fs.readSync(fd, b, 0, 16, 0)",
  "        fs.closeSync(fd)",
  "        rawFmt = transcoder.sniffFormat(b)",
  "      } catch (e) { }",
  "      const targetName = baseName2 + '.' + (rawFmt === 'unknown' ? wantFmt : rawFmt)",
  "",
  "      /* 3) 依次尝试候选目录，用 PowerShell 复制（它有写权限） */",
  "      const cands = []",
  "      if (db.settings.downloadDir) cands.push(db.settings.downloadDir)",
  "      cands.push(defaultDownloadDir())",
  "      cands.push(path.join(ROOT, 'downloads'))",
  "      const dirs = [...new Set(cands.filter(Boolean))]",
  "",
  "      const { spawn } = require('node:child_process')",
  "      const psCopy = (src, dst) => new Promise((resolve) => {",
  "        const esc = (x) => String(x).split(SQ).join(SQ + SQ)",
  "        const cmd = 'Copy-Item -LiteralPath ' + SQ + esc(src) + SQ + ' -Destination ' + SQ + esc(dst) + SQ + ' -Force'",
  "        const c = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', cmd], { windowsHide: true })",
  "        c.on('error', () => resolve(false))",
  "        c.on('close', (code) => {",
  "          try { resolve(code === 0 && fs.existsSync(dst) && fs.statSync(dst).size > 4096) } catch (e) { resolve(false) }",
  "        })",
  "      })",
  "",
  "      let finalPath = ''",
  "      let usedDir = ''",
  "      for (const d of dirs) {",
  "        try { fs.mkdirSync(d, { recursive: true }) } catch (e) { }",
  "        const dest = path.join(d, targetName)",
  "        if (await psCopy(tmpFile, dest)) { finalPath = dest; usedDir = d; break }",
  "      }",
  "      try { fs.unlinkSync(tmpFile) } catch (e) { }",
  "",
  "      if (!finalPath) return json(res, 502, { error: '所有候选目录都写不进去' })",
  "      let size = 0",
  "      try { size = fs.statSync(finalPath).size } catch (e) { }",
  "      try { transcoder.unblockFile(finalPath) } catch (e) { }",
  "      return json(res, 200, { ok: true, path: finalPath, size, name: targetName, dir: usedDir })",
  "    }",
  "",
].join('\n')

s = s.slice(0, start) + impl + s.slice(end)
fs.writeFileSync(p, s, 'utf8')
console.log('save 块已替换为「下载到程序目录 + PowerShell 复制」')
