'use strict'
/* 第 4 批服务端 P2 修复：B30 / B31 / B32 / B33 */
process.chdir(require('node:path').resolve(__dirname, '..'))

const fs = require('node:fs')
const p = 'app/server.js'
let s = fs.readFileSync(p, 'utf8')
const done = []
const miss = []

/* ============ B33: new URL 放进 try ============ */
{
  const old = `const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1')
  const pathname = u.pathname
  try {`

  const neu = `const server = http.createServer(async (req, res) => {
  /* B33: new URL 原来在 try 外面，畸形请求行（//、http://[::1）会抛未处理拒绝，
     客户端拿不到任何响应、连接悬挂。挪进 try，失败回 400。 */
  let u
  try {
    u = new URL(req.url || '/', 'http://127.0.0.1')
  } catch (e) {
    return json(res, 400, { error: '非法请求路径' })
  }
  const pathname = u.pathname
  try {`

  if (s.includes(old)) {
    s = s.replace(old, neu)
    done.push('B33 new URL 进 try')
  } else {
    miss.push('B33 createServer')
  }
}

/* ============ B31: readBody 超限回 413 而不是 ECONNRESET ============ */
{
  const old = `    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('请求体过大')); req.destroy(); return } chunks.push(c) })`

  const neu = `    req.on('data', (c) => {
      size += c.length
      if (size > limit) {
        /* B31: 先停止接收并让上层回 413，别急着 destroy（socket 没了就没法回包） */
        try { req.pause() } catch (e) { }
        try { req.removeAllListeners('data') } catch (e) { }
        reject(Object.assign(new Error('请求体过大（上限 ' + limit + ' 字节）'), { code: 413 }))
        return
      }
      chunks.push(c)
    })`

  if (s.includes(old)) {
    s = s.replace(old, neu)
    done.push('B31 readBody 超限回 413')
  } else {
    const i = s.indexOf("req.on('data'")
    if (i > 0) console.log('  B31 readBody 形态:\n' + s.slice(i, i + 300))
    else miss.push('B31 readBody')
  }
}

/* ============ B32: proxyStream 已发头后强制断开 ============ */
{
  const idx = s.indexOf('function proxyStream')
  if (idx > 0) {
    const bodyStart = s.indexOf('{', idx)
    let depth = 0
    let end = bodyStart
    for (let i = bodyStart; i < s.length; i++) {
      if (s[i] === '{') depth++
      else if (s[i] === '}') { depth--; if (depth === 0) { end = i + 1; break } }
    }
    const oldFn = s.slice(idx, end)

    /* 在函数开头注入 finished/fail，并把错误回调换成 fail */
    let newFn = oldFn
    if (newFn.includes('upstream.on(\'error\'')) {
      /* 注入 fail 工具到函数体开头 */
      const injectPoint = newFn.indexOf('{') + 1
      const failHelper = `
  /* B32: 统一收尾。头已发出时 force-destroy 下游，否则播放器会一直转圈等一个永不完结的响应 */
  let __finished = false
  const __fail = (code, msg) => {
    if (__finished) return
    __finished = true
    try { if (typeof upstream !== 'undefined' && upstream) upstream.destroy() } catch (e) { }
    if (!res.headersSent) { try { json(res, code, { error: msg }) } catch (e) { } return }
    try { res.destroy() } catch (e) { }
  }
`
      newFn = newFn.slice(0, injectPoint) + failHelper + newFn.slice(injectPoint)

      newFn = newFn.replace(/if \(!res\.headersSent\) json\(res, 502[^)]*\)[^\n]*/g,
        "__fail(502, '音频代理失败')")
      newFn = newFn.replace(/if \(!res\.headersSent\) json\(res, 504[^)]*\)[^\n]*/g,
        "__fail(504, '音频源超时')")
    }

    if (newFn !== oldFn) {
      s = s.replace(oldFn, newFn)
      done.push('B32 proxyStream 统一收尾')
    } else {
      miss.push('B32 proxyStream 内部形态')
    }
  } else {
    miss.push('B32 proxyStream 未找到')
  }
}

/* ============ B30: /api/playlist 的 body 归一化 + 写操作强制 POST ============ */
{
  const old = `  async '/api/playlist' (req, q, res, body) {
    const action = q.get('action') || (body && body.action)`

  const neu = `  async '/api/playlist' (req, q, res, body) {
    /* B30: action 可以来自 query，但后面全程强解 body.* —— body 为 null 时 500。
       这里统一归一化：body 为空就用 query 拼一个对象。 */
    const b = body || Object.fromEntries(q.entries())
    const action = b.action
    const WRITE_ACTIONS = new Set(['import', 'create', 'rename', 'delete', 'add', 'remove', 'clear'])
    if (WRITE_ACTIONS.has(action) && req.method !== 'POST') {
      throw Object.assign(new Error('仅支持 POST'), { code: 405 })
    }`

  if (s.includes(old)) {
    s = s.replace(old, neu)

    /* 把函数体里的 body. 全部换成 b.（只在 /api/playlist 内） */
    const idx = s.indexOf("async '/api/playlist'")
    const bodyStart = s.indexOf('{', idx)
    let depth = 0
    let end = bodyStart
    for (let i = bodyStart; i < s.length; i++) {
      if (s[i] === '{') depth++
      else if (s[i] === '}') { depth--; if (depth === 0) { end = i + 1; break } }
    }
    const oldBody = s.slice(idx, end)
    const newBody = oldBody.replace(/\bbody\./g, 'b.').replace(/\(body && b\./g, '(b && b.')
    s = s.replace(oldBody, newBody)

    done.push('B30 playlist body 归一化 + 写操作强制 POST')
  } else {
    miss.push('B30 playlist 开头')
  }
}

fs.writeFileSync(p, s, 'utf8')
console.log('=== 已完成 ===')
done.forEach((d) => console.log('  ✓ ' + d))
if (miss.length) {
  console.log('=== 未匹配 ===')
  miss.forEach((m) => console.log('  ⚠ ' + m))
}
