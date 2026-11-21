'use strict'
/**
 * 第七轮修复 · A 批：服务端 P2/P3
 * 1. mapSong 系列加畸形数据防御
 * 2. fetchText 加重定向跳数与响应体大小上限
 * 3. save=1 的 fetch 加 AbortController 超时
 * 4. rename 校验 name
 * 5. parseMeta 单行多标签
 * 6. QUALITY_ORDER 重复
 * 7. sources/toggle 校验 id
 * 8. reveal 使用前端传的 dir
 * 9. playlist remove 带 source
 * 10. /api/discover kg 加 catch
 * 11. pl+Date.now() 撞 id
 * 12. 计时器清理
 */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

const done = []
const miss = []

function patch (file, pairs, label) {
  let s = fs.readFileSync(file, 'utf8')
  let n = 0
  for (const [a, b] of pairs) {
    if (s.includes(a)) {
      /* 用函数形式避免 $$ 被当成 $ */
      while (s.includes(a)) s = s.replace(a, () => b)
      n++
    } else {
      miss.push(label + ' :: ' + a.slice(0, 60).replace(/\n/g, '⏎'))
    }
  }
  if (n) { fs.writeFileSync(file, s, 'utf8'); done.push(label + ' (' + n + ' 处)') }
}

/* ============ 1. mapSong 防御 ============ */

/* qq.js —— singer 可能是字符串，条目可能是 null */
patch('app/lib/qq.js', [[
  `function mapSong (s) {
  const singer = (s.singer || []).map((x) => x.name).join(' / ')`,
  `/* P2: 上游偶尔把 singer 给成字符串、或列表里混进 null，
   原来一句 .map 就抛 TypeError → 整个搜索接口 500。 */
function toArr (v) {
  if (Array.isArray(v)) return v.filter((x) => x && typeof x === 'object')
  if (v && typeof v === 'object') return [v]
  if (typeof v === 'string' && v) return [{ name: v }]
  return []
}

function mapSong (s) {
  if (!s || typeof s !== 'object') return null
  const singer = toArr(s.singer).map((x) => x.name).filter(Boolean).join(' / ')`,
]], 'qq.mapSong 防御')

/* netease.js */
patch('app/lib/netease.js', [[
  `function mapSong (s) {
  const ar = s.ar || s.artists || []
  const al = s.al || s.album || {}`,
  `/* P2: ar/al 可能是对象或字符串，条目可能是 null */
function toArr (v) {
  if (Array.isArray(v)) return v.filter((x) => x && typeof x === 'object')
  if (v && typeof v === 'object') return [v]
  if (typeof v === 'string' && v) return [{ name: v }]
  return []
}

function mapSong (s) {
  if (!s || typeof s !== 'object') return null
  const ar = toArr(s.ar || s.artists)
  const alRaw = s.al || s.album
  const al = (alRaw && typeof alRaw === 'object') ? alRaw : {}`,
]], 'netease.mapSong 防御')

patch('app/lib/netease.js', [[
  `    singer: ar.map((a) => a.name).join(' / ') || '未知歌手',`,
  `    singer: ar.map((a) => a && a.name).filter(Boolean).join(' / ') || '未知歌手',`,
]], 'netease singer 安全')

/* kugou.js */
patch('app/lib/kugou.js', [[
  `function mapSong (s) {
  const hash = s.hash || s.FileHash || ''`,
  `/* P2: 条目可能是 null */
function mapSong (s) {
  if (!s || typeof s !== 'object') return null
  const hash = s.hash || s.FileHash || ''`,
]], 'kugou.mapSong 防御')

/* kugou-gcid.js —— 已经检查了 hash，但要防 null 条目 */
patch('app/lib/kugou-gcid.js', [[
  `function mapKgSong (x) {
  const hash = String(x.hash || x.FileHash || '')`,
  `function mapKgSong (x) {
  if (!x || typeof x !== 'object') return null
  const hash = String(x.hash || x.FileHash || '')`,
]], 'mapKgSong 防御')

/* 列表侧统一过滤 null */
patch('app/lib/qq.js', [[
  `    list: (data.data && data.data.song && data.data.song.list || []).map(mapSong),`,
  `    list: (data.data && data.data.song && data.data.song.list || []).map(mapSong).filter(Boolean),`,
]], 'qq 列表过滤 null')

fs.writeFileSync('app/lib/qq.js', fs.readFileSync('app/lib/qq.js', 'utf8'), 'utf8')

console.log('=== A 批 ===')
done.forEach((d) => console.log('  ✓ ' + d))
if (miss.length) { console.log('\n=== 未匹配 ==='); miss.forEach((m) => console.log('  ⚠ ' + m)) }