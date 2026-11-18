'use strict'
/* 手机端取流提速：脚本按成功率排序 + 前端缓存 */
const fs = require('node:fs')

/* ---------- 1) lx-engine-web：按优先级遍历脚本 ---------- */
let eng = fs.readFileSync('mobile/www/lib/lx-engine-web.js', 'utf8')

if (!eng.includes('SCRIPT_PRIORITY')) {
  eng = eng.replace(
    'class ScriptManager',
    `/* 已知成功率高的脚本优先（fish 最快最稳，changqing/第三方中转经常失效） */
const SCRIPT_PRIORITY = ['fish', 'nianxin', 'kulao', 'quandouyao', 'yiyin', 'lxv7', 'lx', 'huibq', 'ikun', 'flower', 'grass', 'changqing', 'juhe', 'sixyin']

class ScriptManager`
  )

  /* resolve 里按优先级排序脚本 */
  eng = eng.replace(
    '      for (const [id, s] of this.scripts) {',
    `      const ordered = Array.from(this.scripts.entries()).sort((a, b) => {
        const ia = SCRIPT_PRIORITY.indexOf(a[0])
        const ib = SCRIPT_PRIORITY.indexOf(b[0])
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
      })
      for (const [id, s] of ordered) {`
  )
}

fs.writeFileSync('mobile/www/lib/lx-engine-web.js', eng, 'utf8')
console.log('脚本优先级:', eng.includes('SCRIPT_PRIORITY'))

/* ---------- 2) 前端：取流结果缓存 5 分钟 ---------- */
let app = fs.readFileSync('public/app.js', 'utf8')

if (!app.includes('__urlCache')) {
  /* 在 streamSrc 里加缓存 */
  app = app.replace(
    'async function streamSrc (song, only) {',
    `const __urlCache = new Map()
const URL_TTL = 5 * 60 * 1000

async function streamSrc (song, only) {
  const ck = song.source + '|' + song.id + '|' + (only || '') + '|' + state.quality + '|' + state.dlFormat
  const hit = __urlCache.get(ck)
  if (hit && hit.exp > Date.now()) return hit.url
  const url = await __streamSrcInner(song, only)
  if (url) __urlCache.set(ck, { url, exp: Date.now() + URL_TTL })
  return url
}

async function __streamSrcInner (song, only) {`
  )
}

fs.writeFileSync('public/app.js', app, 'utf8')
console.log('取流缓存:', app.includes('__urlCache'))
