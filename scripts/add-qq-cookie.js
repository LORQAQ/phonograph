'use strict'
/* QQ 歌单需要登录 Cookie：给 qq.js 加可配置的 cookie/uin，fromQQ 用它 */
const fs = require('node:fs')

/* ---------- 1) qq.js：导出 setCookie / getters ---------- */
const qp = 'app/lib/qq.js'
let q = fs.readFileSync(qp, 'utf8')

if (!q.includes('let QQ_COOKIE')) {
  q = q.replace(
    "const HEADERS = {",
    `let QQ_COOKIE = ''
let QQ_UIN = ''

/** 设置登录后的 Cookie（从 my.y.qq.com 复制），用于访问需要登录的接口 */
function setCookie (cookie, uin) {
  QQ_COOKIE = String(cookie || '').trim()
  QQ_UIN = String(uin || '').trim()
  if (!QQ_UIN && QQ_COOKIE) {
    const m = /(?:^|;\\s*)uin=(\\d+)/.exec(QQ_COOKIE)
    if (m) QQ_UIN = m[1]
  }
}
function currentCookie () {
  return QQ_COOKIE ? (QQ_COOKIE + (QQ_COOKIE.endsWith(';') ? '' : ';') + ' uin=' + (QQ_UIN || '0')) : 'uin=0; pgv_pvi=1234567890'
}
function currentUin () { return QQ_UIN || '0' }

const HEADERS = {`
  )
  /* HEADERS 里的 Cookie 改成 getter 方式不行（对象字面量），改为在请求处注入 */
  q = q.replace(/module\.exports = \{/, 'module.exports = { setCookie, currentCookie, currentUin,')
  fs.writeFileSync(qp, q, 'utf8')
  console.log('qq.js setCookie 已加')
} else {
  console.log('qq.js 已有 setCookie')
}

/* ---------- 2) playlist-import.js：fromQQ 用登录信息 ---------- */
const pp = 'app/lib/playlist-import.js'
let p = fs.readFileSync(pp, 'utf8')

if (!p.includes('qq.currentUin')) {
  p = p.replace(
    "'&disstid=' + disstid + '&format=json&g_tk=5381&loginUin=0&hostUin=0&inCharset=utf8&outCharset=utf-8'",
    "'&disstid=' + disstid + '&format=json&g_tk=5381&loginUin=' + qq.currentUin() + '&hostUin=0&inCharset=utf8&outCharset=utf-8'"
  )
  p = p.replace(
    "request(url, { headers: qq.HEADERS, timeout: 20000 }, (err, resp) => {",
    "request(url, { headers: Object.assign({}, qq.HEADERS, { Cookie: qq.currentCookie() }), timeout: 20000 }, (err, resp) => {"
  )
  p = p.replace(
    "if (!cd) throw new Error('QQ 歌单不存在或需要登录访问')",
    "if (!cd) throw new Error('QQ 歌单需要登录才能读取：请到「设置 → QQ 音乐 Cookie」粘贴浏览器里的 Cookie 后重试')"
  )
  fs.writeFileSync(pp, p, 'utf8')
  console.log('fromQQ 已接入登录信息')
} else {
  console.log('fromQQ 已接入')
}
