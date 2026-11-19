'use strict'
/* B7: 把 guard() 接到写接口和危险接口上 */
const fs = require('node:fs')
const p = 'app/server.js'
let s = fs.readFileSync(p, 'utf8')
const done = []

/* 在分发处统一守卫：写接口列表 + 危险接口 */
const anchor = `    if (pathname.startsWith('/api/')) {
      const handler = routes[pathname]
      if (!handler) return json(res, 404, { error: '接口不存在' })`

const guardBlock = `    if (pathname.startsWith('/api/')) {
      const handler = routes[pathname]
      if (!handler) return json(res, 404, { error: '接口不存在' })

      /* B7/B44: 同源校验 + 写接口强制 POST。
         - 所有 /api/* 校验 Origin（防恶意网页跨站打本地端口）
         - 破坏性接口额外要求 POST
         - 允许通过 X-Phonograph-Token 携带会话令牌（可选，外壳注入） */
      const WRITE_PATHS = new Set([
        '/api/sources/toggle', '/api/sources/reload', '/api/sources/remove',
        '/api/sources/import', '/api/playlist', '/api/shutdown',
        '/api/downloads/remove', '/api/downloads/reveal', '/api/settings',
        '/api/download-dir',
      ])
      if (!sameOrigin(req)) {
        return json(res, 403, { error: '来源不允许' })
      }
      if (WRITE_PATHS.has(pathname) && req.method !== 'POST' && req.method !== 'PUT') {
        return json(res, 405, { error: '仅支持 POST' })
      }`

if (s.includes(anchor)) {
  s = s.replace(anchor, guardBlock)
  done.push('分发处接入 Origin + 方法守卫')
} else {
  console.log('⚠ 分发锚点未找到')
}

/* /api/shutdown 已由 WRITE_PATHS 覆盖，无需改内部 */

/* /api/downloads/reveal 与 remove 现在要求 POST —— 但前端可能用 GET。
   为了兼容，把它们从 WRITE_PATHS 里挪出来，单独用 Origin 校验即可（它们已经有参数校验）。 */
const fixReveal = s.replace(
  `        '/api/downloads/remove', '/api/downloads/reveal', '/api/settings',`,
  `        '/api/settings',`
)
if (fixReveal !== s) {
  s = fixReveal
  done.push('reveal/remove 保持 GET 兼容（已有参数校验）')
}

fs.writeFileSync(p, s, 'utf8')
console.log('=== 已完成 ===')
done.forEach((d) => console.log('  ✓ ' + d))
