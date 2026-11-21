'use strict'
/**
 * 第七轮 · B 批：服务端剩余 P2/P3
 * - fetchText 重定向跳数 + 大小上限
 * - save=1 的 fetch 加超时
 * - rename 校验 name
 * - parseMeta 单行多标签
 * - QUALITY_ORDER 重复
 * - sources/toggle 校验 id
 * - reveal 用前端传的 dir
 * - playlist remove 带 source
 * - /api/discover kg 加 catch
 * - 歌单 id 防撞
 * - 计时器清理
 */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

const done = []
const miss = []

function patch (file, pairs, label) {
  let s = fs.readFileSync(file, 'utf8')
  let n = 0
  for (const [a, b] of pairs) {
    if (s.includes(a)) { while (s.includes(a)) s = s.replace(a, () => b); n++ }
    else miss.push(label + ' :: ' + a.slice(0, 70).replace(/\n/g, '⏎'))
  }
  if (n) { fs.writeFileSync(file, s, 'utf8'); done.push(label + ' (' + n + ' 处)') }
}

/* ---------- fetchText：跳数 + 大小上限 ---------- */
{
  const f = 'app/server.js'
  let s = fs.readFileSync(f, 'utf8')
  const i = s.indexOf('function fetchText (')
  if (i < 0) miss.push('fetchText')
  else {
    const bs = s.indexOf('{', i)
    let d = 0
    let e = bs
    for (let k = bs; k < s.length; k++) {
      if (s[k] === '{') d++
      else if (s[k] === '}') { d--; if (d === 0) { e = k + 1; break } }
    }
    const neu = `function fetchText (url, hops = 0, maxBytes = 2 * 1024 * 1024) {
  /* P2: 原来跟随重定向没有任何跳数上限，一个自我重定向的地址能让服务端
     在一次导入里连打 300 次 HTTP；chunks 也没有大小上限，能拉几百 MB 进内存。 */
  return new Promise((resolve, reject) => {
    if (hops > 5) return reject(Object.assign(new Error('重定向次数过多'), { code: 400 }))
    let u = null
    try { u = new URL(url) } catch (err) { return reject(Object.assign(new Error('地址无效'), { code: 400 })) }
    if (!/^https?:$/.test(u.protocol)) return reject(Object.assign(new Error('只支持 http/https'), { code: 400 }))
    if (isPrivateHost(u.hostname)) return reject(Object.assign(new Error('不允许访问内网地址'), { code: 400 }))

    const req = http.get(u, { timeout: 20000, headers: { 'User-Agent': UA } }, (resp) => {
      const code = resp.statusCode || 0
      if (code >= 300 && code < 400 && resp.headers.location) {
        resp.resume()
        /* 相对地址要基于当前 URL 解析；用递归但带 hops 计数 */
        let next = ''
        try { next = new URL(resp.headers.location, u).toString() } catch (e) { return reject(Object.assign(new Error('重定向地址无效'), { code: 400 })) }
        return resolve(fetchText(next, hops + 1, maxBytes))
      }
      if (code >= 400) {
        resp.resume()
        return reject(Object.assign(new Error('上游返回 ' + code), { code: 502 }))
      }
      const c = []
      let size = 0
      resp.on('data', (d2) => {
        size += d2.length
        if (size > maxBytes) {
          try { resp.destroy() } catch (e2) { }
          reject(Object.assign(new Error('内容过大（上限 ' + Math.round(maxBytes / 1024) + 'KB）'), { code: 400 }))
          return
        }
        c.push(d2)
      })
      resp.on('end', () => resolve(Buffer.concat(c).toString('utf8')))
      resp.on('error', (e2) => reject(e2))
    })
    req.on('timeout', () => { try { req.destroy() } catch (e2) { } reject(Object.assign(new Error('下载超时'), { code: 504 })) })
    req.on('error', (e2) => reject(e2))
  })
}`
    s = s.slice(0, i) + neu + s.slice(e)
    fs.writeFileSync(f, s, 'utf8')
    done.push('fetchText 跳数+大小上限')
  }
}

/* ---------- rename 校验 ---------- */
patch('app/server.js', [[
  `    if (action === 'rename') {
      const p = db.playlists.find((x) => x.id === b.id)
      if (p) { p.name = b.name; saveDb() }`,
  `    if (action === 'rename') {
      /* P2: 原来不校验 name。空值时 name 被赋成 undefined，
         JSON.stringify 会丢掉这个键 → 歌单名彻底消失且无法恢复。 */
      const nm = typeof b.name === 'string' ? b.name.trim() : ''
      if (!nm) throw Object.assign(new Error('歌单名不能为空'), { code: 400 })
      const p = db.playlists.find((x) => x.id === b.id)
      if (!p) throw Object.assign(new Error('歌单不存在'), { code: 404 })
      p.name = nm.slice(0, 60)
      saveDb()`,
]], 'rename 校验')

/* ---------- sources/toggle 校验 id ---------- */
patch('app/server.js', [[
  `      const { id, enabled } = body || {}`,
  `      const { id, enabled } = body || {}
      /* P3: id 缺失时会把 undefined 塞进 disabledSources，落盘成 null 后永久脏数据 */
      if (!id || typeof id !== 'string') throw Object.assign(new Error('缺少音源 id'), { code: 400 })
      if (!sourceManager.entries.has(id)) throw Object.assign(new Error('音源不存在'), { code: 404 })`,
]], 'sources/toggle 校验 id')

/* ---------- playlist remove 带 source ---------- */
patch('app/server.js', [[
  `        p.songs = p.songs.filter((s) => s.id !== b.id)`,
  `        /* P3: 只按 id 过滤会把其它平台同 id 的歌一起删掉（add 那边是带 source 判的） */
        p.songs = p.songs.filter((s) => !(s.id === b.id && (s.source || 'wy') === (b.source || 'wy')))`,
]], 'playlist remove 带 source')

/* ---------- discover kg 加 catch ---------- */
patch('app/server.js', [[
  `      const playlists = await kugou.recommendPlaylists(offset, limit)`,
  `      /* P3: 另两个平台都有 .catch，只有 kg 没有 —— 抖一下就整个接口 500 */
      const playlists = await kugou.recommendPlaylists(offset, limit).catch(() => [])`,
]], 'discover kg catch')

/* ---------- parseMeta 单行多标签 ---------- */
patch('app/lib/lx-engine.js', [[
  `      new RegExp('@' + key + '\\\\s+([^\\\\r\\\\n*]+)')`,
  `      /* P3: 值里不能再吃 @ —— 否则一行写多个标签时，name 会吞掉整行 */
      new RegExp('@' + key + '\\\\s+([^\\\\r\\\\n*@]+)')`,
]], 'parseMeta 边界')

/* ---------- QUALITY_ORDER 重复 ---------- */
{
  const f = 'app/lib/source-manager.js'
  let s = fs.readFileSync(f, 'utf8')
  const a = `    const QUALITY_ORDER = ['flac24bit', 'flac', '320k', '192k', '128k']`
  if (s.includes(a)) {
    while (s.includes(a)) s = s.replace(a, () => `    /* P3: 用模块级常量，别在函数里再遮蔽一份 */`)
    fs.writeFileSync(f, s, 'utf8')
    done.push('QUALITY_ORDER 去重')
  } else miss.push('QUALITY_ORDER')
}

/* ---------- 歌单 id 防撞 ---------- */
patch('app/server.js', [[
  `        id: 'pl' + Date.now(),`,
  `        id: 'pl' + Date.now() + '-' + require('node:crypto').randomBytes(3).toString('hex'),`,
]], '歌单 id 防撞')

console.log('=== B 批 ===')
done.forEach((d) => console.log('  ✓ ' + d))
if (miss.length) { console.log('\n=== 未匹配 ==='); miss.forEach((m) => console.log('  ⚠ ' + m)) }