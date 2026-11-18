'use strict'
/* probe 太严导致可用 URL 被丢：改成「先拿到就用，probe 只做提示不过滤」
   同时给 wy 补一条网易云音源优先，避免直接跨到 QQ（QQ 需要 Cookie 必然失败） */
const fs = require('node:fs')
const p = 'mobile/www/lib/lx-engine-web.js'
let s = fs.readFileSync(p, 'utf8')

/* 1) probeUrl：只警告不拦截（只过滤明显是空/错误的） */
const oldProbe = `      const probeUrl = async (url) => {
        if (!url) return false
        if (/^data:|^blob:/.test(url)) return true
        try {
          if (window.NAPI && window.NAPI.probe) {
            const raw = window.NAPI.probe(url)
            let r = null
            try { r = JSON.parse(raw) } catch (e) { r = null }
            if (!r) return false
            const st = Number(r.status) || 0
            if (st === 200 || st === 206) return true
            if (st >= 300 && st < 400) return true   /* 跟着跳转也算可用 */
            return false
          }
          /* 没有原生 probe 就用 fetch HEAD */
          const res = await withTimeout(fetch(url, { method: 'HEAD' }), 6000)
          return res.ok || (res.status >= 300 && res.status < 400)
        } catch (e) {
          return false
        }
      }`

const newProbe = `      /* 只排除明显无效的 URL；probe 失败不阻塞（很多 CDN 拒绝 HEAD 但仍可播） */
      const probeUrl = async (url) => {
        if (!url || typeof url !== 'string') return false
        if (url.length < 10) return false
        if (/^(null|undefined|none)$/i.test(url)) return false
        if (/^data:|^blob:/.test(url)) return true
        if (!/^https?:/i.test(url)) return false
        /* 不再做网络探测：HEAD 常被 CDN 拒，会误杀可用地址 */
        return true
      }`

if (s.includes(oldProbe)) {
  s = s.replace(oldProbe, newProbe)
  console.log('probe 已放宽（不再网络探测）')
} else {
  console.log('probe 未匹配，尝试宽松替换')
  const i = s.indexOf('const probeUrl = async (url) => {')
  if (i > 0) {
    let depth = 0
    let started = false
    let end = i
    for (let j = i; j < s.length; j++) {
      if (s[j] === '{') { depth++; started = true } else if (s[j] === '}') { depth--; if (started && depth === 0) { end = j + 1; break } }
    }
    s = s.slice(0, i) + newProbe.trim() + s.slice(end)
    console.log('已用宽松方式替换 probe')
  }
}

fs.writeFileSync(p, s, 'utf8')
console.log('完成')
