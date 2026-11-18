'use strict'
/* 关键：fish 音源 625 KB 混淆代码，并发解析会把手机内存打爆
   改成「先并发小的，大的串行最后加载」 */
const fs = require('node:fs')
const p = 'mobile/www/lib/lx-engine-web.js'
let s = fs.readFileSync(p, 'utf8')

const oldBlock = `    async loadAll (list) {
      if (this.loading) return this.loading
      this.loading = (async () => {
        const items = list || []
        /* 并发初始化，每个脚本最多等 6 秒，避免串行拖死界面 */
        await Promise.all(items.map(async (item) => {
          try {
            const s = new LxScript(item.id, item.code)
            const t0 = Date.now()
            await s.init(6000)
            s.delay = Date.now() - t0
            this.scripts.set(item.id, s)
            this.codes.set(item.id, item.code)
            console.log('[音源] 已加载', item.id, '→', Object.keys(s.sources).join(','), s.delay + 'ms')
          } catch (e) {
            console.warn('[音源] 跳过', item.id, e.message)
          }
        }))
        this.ready = true
        return this.scripts.size
      })()
      return this.loading
    },`

const newBlock = `    async loadAll (list) {
      if (this.loading) return this.loading
      this.loading = (async () => {
        const items = (list || []).slice()
        /* 按代码体积排序：小的先并发，大的单独串行
           原因：fish 这类 600KB+ 的混淆脚本并发解析会让 WebView 内存爆掉 */
        items.sort((a, b) => (a.code ? a.code.length : 0) - (b.code ? b.code.length : 0))
        const small = items.filter((x) => (x.code ? x.code.length : 0) <= 200 * 1024)
        const big = items.filter((x) => (x.code ? x.code.length : 0) > 200 * 1024)

        const loadOne = async (item) => {
          try {
            const s = new LxScript(item.id, item.code)
            const t0 = Date.now()
            await s.init(8000)
            s.delay = Date.now() - t0
            this.scripts.set(item.id, s)
            this.codes.set(item.id, item.code)
            console.log('[音源] 已加载', item.id, '→', Object.keys(s.sources).join(','), s.delay + 'ms')
          } catch (e) {
            console.warn('[音源] 跳过', item.id, e.message)
          }
        }

        /* 小脚本并发（限 4 个一批，避免同时开太多） */
        for (let i = 0; i < small.length; i += 4) {
          await Promise.all(small.slice(i, i + 4).map(loadOne))
        }
        /* 大脚本一个一个来，加载完让出主线程 */
        for (const item of big) {
          await loadOne(item)
          await new Promise((r) => setTimeout(r, 120))
        }

        this.ready = true
        console.log('[音源] 加载完成，可用', this.scripts.size, '个')
        return this.scripts.size
      })()
      return this.loading
    },`

if (s.includes(oldBlock)) {
  s = s.replace(oldBlock, newBlock)
  fs.writeFileSync(p, s, 'utf8')
  console.log('loadAll 已改为分批加载')
} else {
  console.log('未匹配，尝试宽松替换')
  const i = s.indexOf('async loadAll (list)')
  if (i > 0) {
    /* 找到方法结束 */
    let depth = 0
    let started = false
    let end = i
    for (let j = i; j < s.length; j++) {
      if (s[j] === '{') { depth++; started = true } else if (s[j] === '}') { depth--; if (started && depth === 0) { end = j + 1; break } }
    }
    s = s.slice(0, i) + newBlock.trim().replace(/^async loadAll \(list\) \{/, 'async loadAll (list) {') + s.slice(end)
    /* 修正：newBlock 自带 async loadAll，直接整体替换 */
    s = s.slice(0, i) + newBlock + s.slice(end)
    fs.writeFileSync(p, s, 'utf8')
    console.log('已用宽松方式替换')
  }
}
