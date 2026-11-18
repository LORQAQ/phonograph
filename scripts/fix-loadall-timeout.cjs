'use strict'
/* 音源加载卡死修复：单个音源永不 resolve 会拖住整批
   做法：每个音源硬超时 + 不阻塞整体 */
const fs = require('node:fs')
const p = 'mobile/www/lib/lx-engine-web.js'
let s = fs.readFileSync(p, 'utf8')

const startMark = '    async loadAll (list) {'
const start = s.indexOf(startMark)
if (start < 0) { console.log('未找到 loadAll'); process.exit(1) }

/* 找到方法结束（花括号配对） */
let depth = 0
let started = false
let end = start
for (let i = start; i < s.length; i++) {
  if (s[i] === '{') { depth++; started = true } else if (s[i] === '}') { depth--; if (started && depth === 0) { end = i + 1; break } }
}

const impl = `    async loadAll (list) {
      if (this.loading) return this.loading
      this.loading = (async () => {
        const items = (list || []).slice()
        /* 小脚本先来，大的后置 */
        items.sort((a, b) => (a.code ? a.code.length : 0) - (b.code ? b.code.length : 0))

        const loadOne = async (item) => {
          let s2 = null
          try {
            s2 = new LxScript(item.id, item.code)
          } catch (e) {
            console.warn('[音源] 构造失败', item.id, e && e.message)
            return
          }
          /* 硬超时：init 永不回调也不会卡住整批 */
          const t0 = Date.now()
          let ok = false
          try {
            ok = await Promise.race([
              Promise.resolve(s2.init(6000)).then(() => true),
              new Promise((r) => setTimeout(() => r(false), 7000)),
            ])
          } catch (e) {
            console.warn('[音源] init 异常', item.id, e && e.message)
          }
          if (!ok) {
            console.warn('[音源] 超时跳过', item.id)
            return
          }
          try {
            s2.delay = Date.now() - t0
            this.scripts.set(item.id, s2)
            this.codes.set(item.id, item.code)
            console.log('[音源] 已加载', item.id, '→', Object.keys(s2.sources || {}).join(','), s2.delay + 'ms')
          } catch (e) { }
        }

        /* 逐个加载，每个都有硬超时，一个卡住不影响后面的 */
        for (const item of items) {
          await loadOne(item)
        }

        this.ready = true
        console.log('[音源] 加载完成，可用', this.scripts.size, '个 / 共', items.length, '个')
        return this.scripts.size
      })()
      return this.loading
    }`

s = s.slice(0, start) + impl + s.slice(end)
fs.writeFileSync(p, s, 'utf8')
console.log('loadAll 已改为：逐个加载 + 每个硬超时 7 秒')
