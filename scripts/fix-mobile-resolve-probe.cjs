'use strict'
/* 手机端取流加 probe 验证：音源返回的 URL 可能 404/403，必须验一下再用
   同时改成并行竞速（第一个通过 probe 的赢） */
const fs = require('node:fs')
const p = 'mobile/www/lib/lx-engine-web.js'
let s = fs.readFileSync(p, 'utf8')

const startMark = '    async resolve (platform, info, quality, only) {'
const start = s.indexOf(startMark)
if (start < 0) { console.log('未找到 resolve'); process.exit(1) }

/* 找函数结束 */
let depth = 0
let started = false
let end = start
for (let i = start; i < s.length; i++) {
  if (s[i] === '{') { depth++; started = true } else if (s[i] === '}') { depth--; if (started && depth === 0) { end = i + 1; break } }
}

const impl = `    async resolve (platform, info, quality, only) {
      const withTimeout = (promise, ms) => Promise.race([
        promise,
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
      ])

      if (!this.scripts.size) return null

      /* 验证 URL 真的能下（HEAD 或读前 256 字节） */
      const probeUrl = async (url) => {
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
      }

      const PRIO = ['dujia6', 'kxh', 'yuxi', 'changqing2', 'freelisten']
      const PRIO_KG = ['dujia6', 'kxh', 'yuxi', 'changqing2', 'freelisten']
      const order = platform === 'kg' ? PRIO_KG : PRIO
      const want = only ? [only].concat(order.filter((x) => x !== only)) : order

      const list = want.map((id) => this.scripts.get(id)).filter(Boolean)
      if (!list.length) {
        /* 平台不在优先列表里，全部试一遍 */
        for (const s2 of this.scripts.values()) list.push(s2)
      }

      /* 并行竞速：谁先给出可用 URL 就用谁 */
      const tasks = list.map(async (s2) => {
        try {
          const r = await withTimeout(Promise.resolve(s2.musicUrl(platform, info, quality)), 9000)
          if (!r || !r.url) return null
          const ok = await probeUrl(r.url)
          if (!ok) {
            console.warn('[取流] URL 不可用，跳过', s2.id, r.url.slice(0, 50))
            return null
          }
          return Object.assign({}, r, { provider: r.provider || s2.id })
        } catch (e) {
          return null
        }
      })

      /* 谁先返回可用结果就赢 */
      const winner = await new Promise((resolve) => {
        let pending = tasks.length
        let done = false
        if (!pending) return resolve(null)
        tasks.forEach((t) => {
          t.then((r) => {
            pending--
            if (r && !done) { done = true; resolve(r) }
            else if (!pending && !done) { done = true; resolve(null) }
          }).catch(() => {
            pending--
            if (!pending && !done) { done = true; resolve(null) }
          })
        })
        /* 总超时 20 秒 */
        setTimeout(() => { if (!done) { done = true; resolve(null) } }, 20000)
      })

      return winner
    }`

s = s.slice(0, start) + impl + s.slice(end)
fs.writeFileSync(p, s, 'utf8')
console.log('resolve 已改为：并行竞速 + probe 验证')
