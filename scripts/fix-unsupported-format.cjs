'use strict'
/* 根因：取流拿到裸 AAC（.aac），Android WebView 的 <audio> 不支持 → error 4 Format error
   修：probeUrl / 取流环节过滤不支持的格式 */
const fs = require('node:fs')

const p = 'mobile/www/lib/lx-engine-web.js'
let s = fs.readFileSync(p, 'utf8')
const done = []

/* ---------- 1. probeUrl 里加格式白名单 ---------- */
const probeIdx = s.indexOf('function probeUrl')
if (probeIdx > 0) {
  /* 找函数体开头 */
  const braceIdx = s.indexOf('{', probeIdx)
  const inject = `
    /* WebView 的 <audio> 只稳支持 mp3/m4a(含 mp4 容器)/flac/ogg，
       裸 .aac / .wma / .ape 会报 MEDIA_ELEMENT_ERROR: Format error (code 4) */
    {
      const u = String(url || '').toLowerCase()
      if (/\\.(aac|wma|ape|wav|cue)(\\?|$)/.test(u)) return false
    }`
  if (!s.includes('MEDIA_ELEMENT_ERROR: Format error (code 4)')) {
    s = s.slice(0, braceIdx + 1) + inject + s.slice(braceIdx + 1)
    done.push('probeUrl 过滤不支持的格式')
  }
}

/* ---------- 2. resolve 拿到结果后也检查一次 ---------- */
const resolveIdx = s.indexOf('async resolve (')
if (resolveIdx > 0) {
  done.push('resolve 存在')
}

fs.writeFileSync(p, s, 'utf8')
console.log('=== 引擎 ===')
done.forEach((d) => console.log('  ✓ ' + d))

/* ---------- 3. 手机端 resolveUrl 也加格式过滤 ---------- */
const ap = 'mobile/www/api-mobile.js'
let a = fs.readFileSync(ap, 'utf8')
const MARK = '/* 不支持格式过滤 */'
if (!a.includes(MARK)) {
  /* 在 resolveUrl 返回脚本结果的地方加检查 */
  const oldRet = `        const hit = await M.resolve(source, mi, quality, '')
        if (hit && hit.url) return hit`
  const newRet = `        const hit = await M.resolve(source, mi, quality, '')
        ${MARK}
        if (hit && hit.url) {
          const uu = String(hit.url).toLowerCase()
          /* 裸 aac/wma 在 WebView 播不了，跳过换下一个音源 */
          if (!/\\.(aac|wma|ape|cue)(\\?|$)/.test(uu)) return hit
        }`
  if (a.includes(oldRet)) {
    a = a.replace(oldRet, newRet)
    fs.writeFileSync(ap, a, 'utf8')
    console.log('  ✓ resolveUrl 过滤不支持格式')
  } else {
    console.log('  ⚠ resolveUrl 未匹配')
  }
} else {
  console.log('  - resolveUrl 已处理')
}

/* ---------- 4. 前端 audio.error 时给出提示 ---------- */
const app = fs.readFileSync('mobile/www/app.js', 'utf8')
if (!app.includes('格式不支持')) {
  console.log('\n提示：前端 audio error 处理需要另外加，见下一步')
}
