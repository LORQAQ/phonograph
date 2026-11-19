'use strict'
/* 把 publicSettings 放回模块级（对象外），并让 /api/db 与 /api/settings 用它 */
const fs = require('node:fs')
const p = 'app/server.js'
let s = fs.readFileSync(p, 'utf8')
const done = []

/* 1. 在 routes 对象之前插入 publicSettings */
if (!s.includes('function publicSettings')) {
  const anchor = 'const routes = {'
  if (s.includes(anchor)) {
    const helper = `/* B51: 出口脱敏，不再回显完整 QQ Cookie */
function publicSettings () {
  const out = Object.assign({}, db.settings || {})
  const ck = out.qqCookie
  delete out.qqCookie
  out.qqCookieSet = !!ck
  out.qqCookieTail = ck ? String(ck).slice(-6) : ''
  return out
}

`
    s = s.replace(anchor, helper + anchor)
    done.push('插入 publicSettings 到模块级')
  } else {
    console.log('⚠ 未找到 const routes =')
  }
}

/* 2. /api/db 用 publicSettings */
const dbOld = `  async '/api/db' () {
    return { playlists: db.playlists, settings: db.settings, history: db.history }
  },`
if (s.includes(dbOld)) {
  s = s.replace(dbOld, `  async '/api/db' () {
    return { playlists: db.playlists, settings: publicSettings(), history: db.history }
  },`)
  done.push('/api/db 脱敏')
}

/* 3. /api/settings 的返回也脱敏 */
const stReturn = `    return db.settings`
if (s.includes(stReturn)) {
  s = s.replace(stReturn, `    return publicSettings()`)
  done.push('/api/settings 脱敏')
} else {
  /* 可能是 return { ...db.settings } 形式 */
  const alt = s.match(/async '\/api\/settings'[\s\S]{0,900}?return ([^\n]+)\n/)
  if (alt) console.log('  /api/settings 返回值形态: ' + alt[1].slice(0, 80))
}

fs.writeFileSync(p, s, 'utf8')
console.log('=== 已完成 ===')
done.forEach((d) => console.log('  ✓ ' + d))
