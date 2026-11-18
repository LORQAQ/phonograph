'use strict'
/* 给脚本取流加硬超时：单个源 4 秒不出结果就换下一个，避免 45s 挂死 */
const fs = require('node:fs')

/* 1) 手机端 resolve */
let eng = fs.readFileSync('mobile/www/lib/lx-engine-web.js', 'utf8')
if (!eng.includes('withTimeout')) {
  eng = eng.replace(
    '    async resolve (platform, info, quality, only) {',
    `    async resolve (platform, info, quality, only) {
      const withTimeout = (p, ms) => Promise.race([
        p,
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
      ])
`
  )
  eng = eng.replace(
    '.then(() => s2.musicUrl(platform, info, wanted))',
    '.then(() => withTimeout(Promise.resolve(s2.musicUrl(platform, info, wanted)), 4000))'
  )
  eng = eng.replace(
    'const url = await s2.musicUrl(platform, info, q)',
    'const url = await withTimeout(Promise.resolve(s2.musicUrl(platform, info, q)), 4000)'
  )
  fs.writeFileSync('mobile/www/lib/lx-engine-web.js', eng, 'utf8')
  console.log('手机端超时:', eng.includes('withTimeout'))
}

/* 2) 电脑端 source-manager：每个脚本调用加超时 */
let sm = fs.readFileSync('app/lib/source-manager.js', 'utf8')
if (!sm.includes('callWithTimeout')) {
  sm = sm.replace(
    "const QUALITY_ORDER = ['flac24bit', 'flac', '320k', '192k', '128k']",
    `const QUALITY_ORDER = ['flac24bit', 'flac', '320k', '192k', '128k']

/* 单个音源最多等 5 秒，防止某个源网络挂住拖垮整首 */
function callWithTimeout (fn, ms = 5000) {
  return Promise.race([
    Promise.resolve().then(fn),
    new Promise((_, rej) => setTimeout(() => rej(new Error('音源超时')), ms)),
  ])
}`
  )
  sm = sm.split('const url = await entry.script.musicUrl(platform, musicInfo, q)')
    .join('const url = await callWithTimeout(() => entry.script.musicUrl(platform, musicInfo, q), 5000)')
  fs.writeFileSync('app/lib/source-manager.js', sm, 'utf8')
  console.log('电脑端超时:', sm.includes('callWithTimeout(() =>'))
}
