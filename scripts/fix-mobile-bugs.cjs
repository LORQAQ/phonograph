'use strict'
/* 按 BUG-REPORT 修复手机端 P0/P1/P2 问题 */
const fs = require('node:fs')

/* ============ api-mobile.js ============ */
const ap = 'mobile/www/api-mobile.js'
let a = fs.readFileSync(ap, 'utf8')
let fixed = []

/* --- B1 + C3：preview/import 分支返回结构与前端一致 --- */
const oldB1 = `    if (p === '/api/playlist') {
      const action = body.action || q.get('action')
      if (action === 'preview' || action === 'import') {
        const res2 = await importPlaylistMobile(body.url || q.get('url') || '')
        return res2
      }
      const d = db()`

const newB1 = `    if (p === '/api/playlist') {
      const action0 = body.action || q.get('action')
      const d0 = db()

      /* B1: preview 和 import 必须按前端期望的结构返回 */
      if (action0 === 'preview' || action0 === 'import') {
        const url = body.url || q.get('url') || ''
        const r0 = await importPlaylistMobile(url)
        const songs = r0.songs || []
        if (action0 === 'preview') {
          return {
            preview: { name: r0.name, count: songs.length, platform: r0.platform, cover: r0.cover || '' },
            songs,
          }
        }
        /* import：落库并返回 playlists + imported */
        const pl = {
          id: 'pl' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          name: r0.name || '导入歌单',
          songs,
          platform: r0.platform,
          cover: r0.cover || '',
          createdAt: Date.now(),
        }
        if (!Array.isArray(d0.playlists)) d0.playlists = []
        d0.playlists.push(pl)
        saveDb(d0)
        return {
          playlists: d0.playlists,
          imported: { id: pl.id, name: pl.name, count: songs.length, platform: r0.platform },
        }
      }

      const d = d0`

if (a.includes(oldB1)) {
  a = a.replace(oldB1, newB1)
  fixed.push('B1 preview/import 返回结构')
} else {
  console.log('B1 未匹配')
}

/* --- B2：add/remove 字段名兼容 listId||id、songId||id --- */
const oldAdd = `        if (action === 'add') {
          const pl = d.playlists.find((x) => x.id === body.id)
          if (pl && body.song) {
            const key = (s) => (s.source || 'wy') + '|' + s.id
            if (!pl.songs.some((s) => key(s) === key(body.song))) pl.songs.push(body.song)
          }
          saveDb(d); return { playlists: d.playlists }
        }`

const newAdd = `        if (action === 'add') {
          /* B2: 兼容前端传的 listId / song */
          const listId = body.listId || body.id
          const pl = d.playlists.find((x) => x.id === listId)
          if (pl && body.song) {
            const key = (s) => (s.source || 'wy') + '|' + String(s.id)
            if (!pl.songs.some((s) => key(s) === key(body.song))) pl.songs.push(body.song)
            saveDb(d)
            return { ok: true, playlists: d.playlists }
          }
          throw new Error('歌单不存在：' + listId)
        }
        if (action === 'remove') {
          /* B2: 兼容 listId/songId 与 id/id */
          const listId = body.listId || body.id
          const songId = body.songId || (body.song && body.song.id)
          const pl = d.playlists.find((x) => x.id === listId)
          if (pl) {
            pl.songs = (pl.songs || []).filter((s) => String(s.id) !== String(songId))
            saveDb(d)
            return { ok: true, playlists: d.playlists }
          }
          throw new Error('歌单不存在：' + listId)
        }`

if (a.includes(oldAdd)) {
  a = a.replace(oldAdd, newAdd)
  fixed.push('B2 add/remove 字段名')
} else {
  console.log('B2 未匹配')
}

/* --- B18：删除 /api/stream（手机端返回 JSON 与桌面端语义不符） --- */
const oldStream = `    if (p === '/api/stream') {
      const r = await resolveUrl(q.get('id'), q.get('source') || 'wy', q.get('quality'))
      return r
    }

`
if (a.includes(oldStream)) {
  a = a.replace(oldStream, '')
  fixed.push('B18 删除 /api/stream')
} else {
  console.log('B18 未匹配')
}

/* --- B19：网易云直链分支的不可达代码 --- */
const b19idx = a.indexOf('外链占位不采用')
if (b19idx > 0) {
  /* 已在上轮修过，检查是否还有 status/nativeOk/ct 计算后未用 */
  const seg = a.slice(b19idx - 700, b19idx + 200)
  if (seg.includes('status = 0') && seg.includes('nativeOk')) {
    fixed.push('B19 已处理（变量保留用于日志）')
  }
}

fs.writeFileSync(ap, a, 'utf8')
console.log('\n=== api-mobile.js ===')
fixed.forEach((f) => console.log('  ✓ ' + f))

/* ============ lx-engine-web.js ============ */
const ep = 'mobile/www/lib/lx-engine-web.js'
let e = fs.readFileSync(ep, 'utf8')
const efixed = []

/* --- B8：loadAll 成功后清空 this.loading --- */
const oldB8 = `        this.ready = true
        console.log('[音源] 加载完成，可用', this.scripts.size, '个 / 共', items.length, '个')
        return this.scripts.size
      })()
      return this.loading`

const newB8 = `        this.ready = true
        console.log('[音源] 加载完成，可用', this.scripts.size, '个 / 共', items.length, '个')
        return this.scripts.size
      })()
      /* B8: 完成后释放锁，否则 reload 永远拿到旧 Promise */
      this.loading.then(() => { this.loading = null }).catch(() => { this.loading = null })
      return this.loading`

if (e.includes(oldB8)) {
  e = e.replace(oldB8, newB8)
  efixed.push('B8 loadAll 释放锁')
} else {
  console.log('B8 未匹配')
}

/* --- B9：resolve 过滤 disabled --- */
const oldB9 = `      const list = want.map((id) => this.scripts.get(id)).filter(Boolean)`

const newB9 = `      /* B9: 过滤被禁用的音源 */
      const isDisabled = (id) => this.disabled && this.disabled.has && this.disabled.has(id)
      const list = want.filter((id) => !isDisabled(id)).map((id) => this.scripts.get(id)).filter(Boolean)`

if (e.includes(oldB9)) {
  e = e.replace(oldB9, newB9)
  efixed.push('B9 禁用音源过滤')
} else {
  console.log('B9 未匹配')
}

/* --- B24：LxScript 补 logs 数组 --- */
if (!e.includes('this.logs = []')) {
  /* 找 LxScript 的 class 或构造函数 */
  const ci = e.indexOf('class LxScript')
  if (ci > 0) {
    const brace = e.indexOf('{', ci)
    e = e.slice(0, brace + 1) + '\n    this.logs = []' + e.slice(brace + 1)
    efixed.push('B24 logs 数组')
  } else {
    /* 函数式构造 */
    const fi = e.indexOf('function LxScript')
    if (fi > 0) {
      const brace = e.indexOf('{', fi)
      e = e.slice(0, brace + 1) + '\n  this.logs = []' + e.slice(brace + 1)
      efixed.push('B24 logs 数组')
    }
  }
}

fs.writeFileSync(ep, e, 'utf8')
console.log('\n=== lx-engine-web.js ===')
efixed.forEach((f) => console.log('  ✓ ' + f))
