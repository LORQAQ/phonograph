'use strict'
/**
 * 第七轮 · G 批：构建链
 * 1. assemble 的 index.html 也走断言（防锚点漂移静默产出白屏包）
 * 2. sources-data 白名单写进生成器（防 xingkong 被塞回手机包）
 * 3. verify-installer 校验 留声.exe
 * 4. 卸载器从注册表读实际安装路径
 * 5. 安装失败设退出码
 * 6. release 脚本失败设退出码
 * 7. push-via-api 用 git status 驱动
 * 8. 外壳启动后核对 /api/health 版本
 */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

const done = []
const miss = []

/* ---------- 1. assemble：index.html 加断言 ---------- */
{
  const f = 'scripts/assemble-mobile-www.js'
  let s = fs.readFileSync(f, 'utf8')
  if (!s.includes('assertHtml')) {
    const anchor = "fs.writeFileSync(path.join(WWW, 'index.html'), html, 'utf8')"
    if (s.includes(anchor)) {
      s = s.replace(anchor, () => `/* P1: index.html 的替换原来全是裸 replace，锚点一变就是 no-op，
         产物仍是 <script src="/app.js"> 且不注入 8 个必需脚本 —— 白屏包，而旧验证全绿。 */
    function assertHtml (h) {
      const errs = []
      if (/src="\\/app\\.js/.test(h)) errs.push('app.js 还是绝对路径')
      if (/href="\\/style\\.css/.test(h)) errs.push('style.css 还是绝对路径')
      const need = ['api-mobile.js', 'sources-data.js', 'lib/lx-engine-web.js', 'lib/native-http.js', 'lib/music-libs.js']
      for (const n of need) {
        if (!h.includes('src="' + n + '"')) errs.push('没注入 ' + n)
      }
      if (errs.length) {
        throw new Error('index.html 组装失败：\\n  - ' + errs.join('\\n  - '))
      }
    }
    assertHtml(html)
    ${anchor}`)
      fs.writeFileSync(f, s, 'utf8')
      done.push('assemble index.html 断言')
    } else miss.push('assemble 锚点')
  } else done.push('assemble 已断言')
}

/* ---------- 2. sources-data 白名单 ---------- */
{
  const f = 'scripts/build-sources-bundle.js'
  if (fs.existsSync(f)) {
    let s = fs.readFileSync(f, 'utf8')
    if (!s.includes('MOBILE_EXCLUDE')) {
      /* 在文件开头插入黑名单常量 + 过滤逻辑 */
      const anchor = 'const files = fs.readdirSync'
      if (s.includes(anchor)) {
        s = s.replace(anchor, () => `/* P1: 手机端不能用这几个 —— xingkong 在手机上 init 会同步卡死。
   生成器原来没有黑名单，重跑一次就会把这个源塞回手机包。 */
const MOBILE_EXCLUDE = ['xingkong']
${anchor}`)
        fs.writeFileSync(f, s, 'utf8')
        done.push('sources 生成器黑名单常量')
      }
    }
    /* 过滤 */
    let s2 = fs.readFileSync(f, 'utf8')
    const m = s2.match(/const files = fs\.readdirSync\(([^)]*)\)([^\n]*)/)
    if (m && !s2.includes('MOBILE_EXCLUDE)')) {
      s2 = s2.replace(m[0], () => `${m[0]}.filter((f) => !MOBILE_EXCLUDE.includes(f.replace(/\\.js$/i, '')))`)
      fs.writeFileSync(f, s2, 'utf8')
      done.push('sources 生成器过滤')
    }
  } else miss.push('build-sources-bundle.js 不存在')
}

/* ---------- 3. verify-installer 校验 留声.exe ---------- */
{
  const f = 'scripts/verify-installer.cjs'
  if (fs.existsSync(f)) {
    let s = fs.readFileSync(f, 'utf8')
    if (!s.includes("'留声.exe'")) {
      /* 在 MUST 检查列表附近插入 */
      const anchor = "const MUST = ["
      const i = s.indexOf(anchor)
      if (i >= 0) {
        s = s.slice(0, i + anchor.length) + "'留声.exe', 'LXMusic.ico', " + s.slice(i + anchor.length)
        fs.writeFileSync(f, s, 'utf8')
        done.push('verify-installer 加 留声.exe')
      } else miss.push('verify-installer MUST')
    } else done.push('verify-installer 已含')
  } else miss.push('verify-installer.cjs')
}

console.log('=== G 批（脚本层）===')
done.forEach((d) => console.log('  ✓ ' + d))
if (miss.length) { console.log('未匹配:'); miss.forEach((m) => console.log('  ⚠ ' + m)) }