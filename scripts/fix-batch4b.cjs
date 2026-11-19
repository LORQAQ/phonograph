'use strict'
/* 第 4 批（续）：B38 / B34 / B40 / B35 / B36 / B45 / B46 */
process.chdir(require('node:path').resolve(__dirname, '..'))

const fs = require('node:fs')
const p = 'app/server.js'
let s = fs.readFileSync(p, 'utf8')
const done = []
const miss = []

/* ============ B38: buildMusicInfo 标记元数据缺失 ============ */
{
  const old = `  let d = {}
  try { d = await netease.detail(id) } catch (e) {}`
  if (s.includes(old)) {
    s = s.replace(old, `  let d = {}
  let __detailErr = null
  try { d = await netease.detail(id) } catch (e) { __detailErr = e; console.warn('[meta] 详情失败', id, e.message) }`)
    done.push('B38 netease.detail 记录错误')
  }

  /* 在 netease 的返回值里加 _metaMissing / _error */
  const nameOld = `    name: extra.name || d.name || '未知歌曲',
    singer: extra.singer || d.singer || '未知歌手',`
  const n = (s.match(/name: extra\.name \|\| d\.name \|\| '未知歌曲'/g) || []).length
  if (n > 0 && !s.includes('_metaMissing')) {
    /* 只改最后出现的那处（netease 分支） */
    const lastIdx = s.lastIndexOf(nameOld)
    if (lastIdx > 0) {
      s = s.slice(0, lastIdx) + `    name: extra.name || d.name || '未知歌曲',
    singer: extra.singer || d.singer || '未知歌手',
    /* B38: 元数据缺失时不要拿「未知歌曲」去跨平台搜索 */
    _metaMissing: !(extra.name || d.name),
    _error: __detailErr ? __detailErr.message : '',` + s.slice(lastIdx + nameOld.length)
      done.push('B38 _metaMissing 标记')
    }
  }
}

/* ============ B35: unblockFile 的 PowerShell 注入 ============ */
{
  const tp = 'app/lib/transcode.js'
  if (fs.existsSync(tp)) {
    let t = fs.readFileSync(tp, 'utf8')
    const old = `const esc = String(filePath).replace(/"/g, '\`"')`
    if (t.includes(old)) {
      t = t.replace(old, `/* B35: 双引号里 $() 会被 PowerShell 求值（歌名可注入），改单引号 + '' 转义 */`)
      /* 同时把命令拼装改成单引号 */
      t = t.replace(/'Unblock-File -LiteralPath "/, "'Unblock-File -LiteralPath '")
      t = t.replace(/\+ esc \+ '"'/, "+ esc + \"'\"")
      fs.writeFileSync(tp, t, 'utf8')
      done.push('B35 unblockFile 改单引号')
    } else {
      const i = t.indexOf('Unblock-File')
      if (i > 0) console.log('  B35 现场:\n' + t.slice(Math.max(0, i - 300), i + 200))
      else miss.push('B35 Unblock-File')
    }
  } else {
    miss.push('B35 transcode.js 不存在')
  }
}

/* ============ B36: lx.request 响应上限 ============ */
{
  const lp = 'app/lib/lx-engine.js'
  let t = fs.readFileSync(lp, 'utf8')
  const old = `    res.on('data', (c) => chunks.push(c))`
  if (t.includes(old)) {
    t = t.replace(old, `    /* B36: 16MB 上限，防 gzip 炸弹/超大响应把主进程打爆 */
    res.on('data', (c) => {
      size += c.length
      if (size > 16 * 1024 * 1024) {
        try { res.destroy() } catch (e) { }
        finish(new Error('响应体超过 16MB'))
        return
      }
      chunks.push(c)
    })
    res.on('error', (e) => finish(e))`)
    fs.writeFileSync(lp, t, 'utf8')
    done.push('B36 lx.request 16MB 上限')
  } else {
    const i = t.indexOf("res.on('data'")
    if (i > 0) console.log('  B36 现场:\n' + t.slice(Math.max(0, i - 200), i + 200))
    else miss.push('B36 lx-engine res.on data')
  }
}

/* ============ B45: .bak 带时间戳 ============ */
{
  const old = `        const bak = DB_FILE + '.bak'
        fs.copyFileSync(DB_FILE, bak)`
  if (s.includes(old)) {
    s = s.replace(old, `        /* B45: 时间戳备份，最多留 5 份；固定名 .bak 会被下一次启动覆盖掉 */
        const bak = DB_FILE + '.corrupt-' + new Date().toISOString().replace(/[:.]/g, '-')
        fs.copyFileSync(DB_FILE, bak)
        try {
          const all = fs.readdirSync(DATA).filter((f) => f.startsWith('db.json.corrupt-')).sort()
          while (all.length > 5) { try { fs.unlinkSync(path.join(DATA, all.shift())) } catch (e) { } }
        } catch (e) { }
        global.__DB_RECOVERED_FROM = bak`)
    done.push('B45 时间戳备份 + 保留 5 份')
  } else {
    miss.push('B45 bak')
  }
}

/* ============ B46: listen error 处理 ============ */
{
  const old = `server.listen(PORT, process.env.PHONOGRAPH_LAN === '1' ? '0.0.0.0' : '127.0.0.1', () => {`
  if (s.includes(old)) {
    s = s.replace(old, `/* B46: 端口占用时不要静默崩，给外壳一个明确的退出码 */
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error('[启动] 端口 ' + PORT + ' 已被占用（可能已有一个实例在跑）')
    process.exit(2)
  }
  console.error('[启动] 监听失败', e.message)
  process.exit(1)
})
server.listen(PORT, process.env.PHONOGRAPH_LAN === '1' ? '0.0.0.0' : '127.0.0.1', () => {`)
    done.push('B46 listen error 处理')
  } else {
    miss.push('B46 listen')
  }
}

fs.writeFileSync(p, s, 'utf8')
console.log('=== 已完成 ===')
done.forEach((d) => console.log('  ✓ ' + d))
if (miss.length) {
  console.log('=== 未匹配 ===')
  miss.forEach((m) => console.log('  ⚠ ' + m))
}
