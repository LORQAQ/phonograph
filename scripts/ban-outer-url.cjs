'use strict'
/* kxh 有时返回的是网易云外链（song/media/outer/url），那只是 302 占位，播不了
   在 probeUrl 里把外链判为无效，让引擎继续试下一个音源 */
const fs = require('node:fs')
const p = 'mobile/www/lib/lx-engine-web.js'
let s = fs.readFileSync(p, 'utf8')

const oldProbe = `        if (/^data:|^blob:/.test(url)) return true
        if (!/^https?:/i.test(url)) return false
        /* 不再做网络探测：HEAD 常被 CDN 拒，会误杀可用地址 */
        return true`

const newProbe = `        if (/^data:|^blob:/.test(url)) return true
        if (!/^https?:/i.test(url)) return false
        /* 网易云外链只是 302 占位，播放必然 Format error，直接判无效 */
        if (/music\\.163\\.com\\/song\\/media\\/outer\\/url/i.test(url)) {
          console.warn('[取流] 收到外链占位，跳过', url.slice(0, 50))
          return false
        }
        /* 不再做网络探测：HEAD 常被 CDN 拒，会误杀可用地址 */
        return true`

if (s.includes(oldProbe)) {
  s = s.replace(oldProbe, newProbe)
  fs.writeFileSync(p, s, 'utf8')
  console.log('probeUrl 已过滤网易云外链')
} else {
  console.log('未匹配 probeUrl')
}

/* resolveUrl（直链兜底）里也排掉外链 */
const ap = 'mobile/www/api-mobile.js'
let a = fs.readFileSync(ap, 'utf8')
if (!a.includes('外链占位不采用')) {
  a = a.replace(
    `      /* 原生 probe 已经判过 Content-Type 和内容头，直接信它 */
      const okStatus = status === 200 || status === 206
      if (okStatus && nativeOk) {
        return { url: u, quality: ct.indexOf('audio') >= 0 ? '320k' : '128k', provider: '网易云外链' }
      }`,
    `      /* 外链占位不采用（302 到失效地址，播放必失败） */
      throw new Error('网易云外链不可用，换一首试试')`
  )
  fs.writeFileSync(ap, a, 'utf8')
  console.log('resolveUrl 已移除外链兜底')
}
