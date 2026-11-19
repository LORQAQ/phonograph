'use strict'
/* 优化酷狗（以及其他平台）切歌延迟
   根因：/api/url 等的是 loadPromise（全部 7 个音源加载完，
         fish 是 640KB 混淆代码，init 超时 12 秒 → 冷启动点歌要等十几秒）
   改法：等到「至少有一个音源就绪」就开始取流，不等全部 */
process.chdir(require('node:path').resolve(__dirname, '..'))
const fs = require('node:fs')
const p = 'app/server.js'
let s = fs.readFileSync(p, 'utf8')
const done = []
const miss = []

/* ---------- 1. 注入 waitForAnySource ---------- */
if (!s.includes('async function waitForAnySource')) {
  const anchor = 'const routes = {'
  if (s.includes(anchor)) {
    const helper = `/* 等到「至少一个音源就绪」就返回，不等全部加载完。
   fish 是 640KB 混淆代码，init 最长 12 秒；等全部会让冷启动点歌卡十几秒。 */
async function waitForAnySource (maxMs = 8000) {
  const t0 = Date.now()
  while (Date.now() - t0 < maxMs) {
    try {
      const entries = sourceManager && sourceManager.entries
      if (entries && entries.size > 0) {
        for (const e of entries.values()) {
          if (e.status === 'ok' && e.script) return true
        }
      }
    } catch (err) { }
    await new Promise((r) => setTimeout(r, 150))
  }
  return false
}

`
    s = s.replace(anchor, helper + anchor)
    done.push('注入 waitForAnySource')
  } else {
    miss.push('routes 锚点')
  }
}

/* ---------- 2. 替换 await loadPromise ---------- */
const oldWait = '    await loadPromise.catch(() => {})'
const oldWait2 = '    await loadPromise.catch(() => { })'
let n = 0

if (s.includes(oldWait)) {
  s = s.split(oldWait).join('    await waitForAnySource()')
  n += (s.match(/await waitForAnySource\(\)/g) || []).length
}
if (s.includes(oldWait2)) {
  s = s.split(oldWait2).join('    await waitForAnySource()')
  n++
}
if (n > 0) done.push('替换 loadPromise 等待（' + n + ' 处）')
else miss.push('loadPromise 等待')

fs.writeFileSync(p, s, 'utf8')
console.log('=== 已完成 ===')
done.forEach((d) => console.log('  ✓ ' + d))
if (miss.length) {
  console.log('=== 未匹配 ===')
  miss.forEach((m) => console.log('  ⚠ ' + m))
}

/* ---------- 3. 确认 ---------- */
const check = fs.readFileSync(p, 'utf8')
console.log('\n验证:')
console.log('  waitForAnySource 定义:', check.includes('async function waitForAnySource') ? '✓' : '✗')
console.log('  loadPromise 剩余引用:', (check.match(/await loadPromise/g) || []).length + ' 处')
console.log('  waitForAnySource 调用:', (check.match(/await waitForAnySource\(\)/g) || []).length + ' 处')
