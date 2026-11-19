'use strict'
/* 从脚本位置推导项目根，避免 CWD 依赖 */
process.chdir(require('node:path').resolve(__dirname, '..'))

/* 第 3 批手机端修复：B22 / B23 / B20 / B6(手机) / B74 */
const fs = require('node:fs')
const done = []
const miss = []

/* ============ B22: 响应缺 statusCode/headers ============ */
{
  /* 1) 产出侧补别名 */
  const p = 'mobile/www/lib/native-http.js'
  let s = fs.readFileSync(p, 'utf8')
  const old = `        resolve({ status: r.status || 200, body: r.body || '' })`
  if (s.includes(old)) {
    s = s.replace(old, `        resolve({
          status: r.status || 200,
          /* B22: 音源脚本按 statusCode / headers 取值，这里补别名 */
          statusCode: r.status || 200,
          headers: r.headers || {},
          body: r.body || '',
        })`)
    fs.writeFileSync(p, s, 'utf8')
    done.push('B22 native-http 补 statusCode/headers')
  } else {
    const i = s.indexOf('resolve({')
    if (i > 0) console.log('  native-http resolve 形态: ' + s.slice(i, i + 150).replace(/\n/g, ' '))
    else miss.push('B22 native-http resolve')
  }

  /* 2) 消费侧给默认值，且不吞回调异常 */
  const p2 = 'mobile/www/lib/lx-engine-web.js'
  let s2 = fs.readFileSync(p2, 'utf8')
  const old2 = `        try { callback(null, { statusCode: resp.statusCode, body, headers: resp.headers }, body) } catch (e) {}`
  if (s2.includes(old2)) {
    s2 = s2.replace(old2, `        /* B22: resp 里可能只有 status，取不到就退回 200；回调异常不再静默吞掉 */
        const _status = resp.statusCode != null ? resp.statusCode : (resp.status != null ? resp.status : 200)
        try {
          callback(null, { statusCode: _status, headers: resp.headers || {}, body }, body)
        } catch (e) {
          console.warn('[lx] 脚本回调异常', e && e.stack ? e.stack : e)
        }`)
    fs.writeFileSync(p2, s2, 'utf8')
    done.push('B22 引擎侧 statusCode 兜底 + 不吞异常')
  } else {
    miss.push('B22 引擎 callback')
  }
}

/* ============ B23: 手机端音源面板四个操作 ============ */
{
  const p = 'mobile/www/api-mobile.js'
  let s = fs.readFileSync(p, 'utf8')

  const old = `    if (p.startsWith('/api/sources/')) {
      const M = window.LxScriptManager
      return { ok: true, list: M ? M.list() : [] }
    }`

  /* 尝试多种可能形态 */
  const patterns = [
    /    if \(p\.startsWith\('\/api\/sources\/'\)\) \{[\s\S]*?\n    \}/,
  ]
  let matched = null
  for (const re of patterns) {
    const m = s.match(re)
    if (m) { matched = m[0]; break }
  }

  if (matched) {
    const repl = `    /* B23: 之前整个 /api/sources/* 子树被一个兜底吃掉，什么也不做直接返回 200 —— 
       禁用/重载/导入/删除四个操作全部静默失效。这里真正派发。 */
    if (p.startsWith('/api/sources/')) {
      const M = window.LxScriptManager
      if (!M) throw new Error('音源管理器未就绪，请稍后重试')
      const action = p.slice('/api/sources/'.length)

      if (opts.method === 'POST' || action !== 'list') {
        if (action === 'toggle') {
          const r = M.toggle(body && body.id, !!(body && body.enabled))
          return { list: r || M.list() }
        }
        if (action === 'reload') {
          if (body && body.id) await M.reload(body.id)
          else await M.loadAll()
          return { list: M.list() }
        }
        if (action === 'remove') {
          M.remove(body && body.id)
          return { list: M.list() }
        }
        if (action === 'import') {
          let code = (body && body.code) || ''
          if (!code && body && body.url) {
            const r = await nativeHttp(body.url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
            code = r.body || ''
          }
          if (!code) throw new Error('缺少脚本内容')
          if (String(code).length > 2 * 1024 * 1024) throw new Error('脚本超过 2MB，拒绝导入')
          const id = 'custom_' + Date.now().toString(36)
          await M.addCode(id, code, (body && body.name) || id)
          return { list: M.list() }
        }
      }
      return { list: M.list() }
    }`
    s = s.replace(matched, repl)
    fs.writeFileSync(p, s, 'utf8')
    done.push('B23 音源面板四操作派发')
  } else {
    miss.push('B23 sources 兜底')
  }
}

/* ============ B20: 移除歌曲认 body.id ============ */
{
  const p = 'mobile/www/api-mobile.js'
  let s = fs.readFileSync(p, 'utf8')

  const old = `          const songId = body.songId || (body.song && body.song.id)`
  if (s.includes(old)) {
    s = s.replace(old, `          /* B20: 前端发的是 { listId, id: song.id }，body.id 也要认 */
          const songId = body.songId != null ? body.songId
            : (body.song && body.song.id != null ? body.song.id : body.id)`)
    fs.writeFileSync(p, s, 'utf8')
    done.push('B20 移除歌曲认 body.id')
  } else {
    const i = s.indexOf("action === 'remove'")
    if (i > 0) console.log('  B20 remove 形态:\n' + s.slice(i, i + 500))
    else miss.push('B20 remove')
  }
}

/* ============ B6(手机) / B74: 未实现接口返回空结构而不是抛错 ============ */
{
  const p = 'mobile/www/api-mobile.js'
  let s = fs.readFileSync(p, 'utf8')

  const old = `    throw new Error('未实现的接口: ' + p)`
  if (s.includes(old)) {
    s = s.replace(old, `    /* B74: 未实现接口返回可渲染的空结构，不要让前端吃 unhandled rejection */
    if (p.startsWith('/api/downloads')) return { list: [], total: 0 }
    if (p === '/api/download-dir') return { dir: '' }
    console.warn('[api-mobile] 未实现:', p)
    return { ok: false, error: '手机端不支持这个接口：' + p }`)
    fs.writeFileSync(p, s, 'utf8')
    done.push('B74 未实现接口返回空结构')
  } else {
    miss.push('B74 未实现接口')
  }
}

console.log('=== 已完成 ===')
done.forEach((d) => console.log('  ✓ ' + d))
if (miss.length) {
  console.log('=== 未匹配 ===')
  miss.forEach((m) => console.log('  ⚠ ' + m))
}
