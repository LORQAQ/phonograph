'use strict'
/*
 * GD Studio 聚合音乐 API 客户端（音乐源 API 层）
 * 服务： https://music-api.gdstudio.xyz   支持 types=search | url | pic | lyric
 * 带本地缓存 + 串行队列 + 失败重试，规避接口限频（403/429）。
 */
const { request } = require('./lx-engine.js')

const API_BASE = 'https://music-api.gdstudio.xyz/api.php'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

const PLATFORM_MAP = {
  wy: 'netease',
  tx: 'tencent',
  kw: 'kuwo',
  kg: 'kugou',
  mg: 'migu',
  joox: 'joox',
  netease: 'netease',
  tencent: 'tencent',
  kuwo: 'kuwo',
  kugou: 'kugou',
  migu: 'migu',
}

const cache = new Map()
const CACHE_TTL = { search: 5 * 60e3, url: 3 * 60e3, lyric: 60 * 60e3, pic: 24 * 60 * 60e3 }

function toGdSource (source) { return PLATFORM_MAP[source] || 'netease' }

function cacheGet (key) {
  const hit = cache.get(key)
  if (hit && hit.exp > Date.now()) return hit.value
  cache.delete(key)
  return null
}
function cacheSet (key, value, ttl) {
  cache.set(key, { value, exp: Date.now() + ttl })
  if (cache.size > 500) cache.delete(cache.keys().next().value)
}

/* 串行队列：所有对 gd 的请求排队，避免并发触发限流 */
let chain = Promise.resolve()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
function enqueue (task) {
  const run = chain.then(task, task)
  chain = run.catch(() => {}).then(() => sleep(120))
  return run
}

function rawRequest (params, timeout) {
  const u = new URL(API_BASE)
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, String(v))
  const url = u.toString()
  return new Promise((resolve, reject) => {
    request(url, {
      method: 'GET',
      timeout,
      headers: { 'User-Agent': UA, Accept: 'application/json', Referer: 'https://music.gdstudio.xyz/' },
    }, (err, resp) => {
      if (err) return reject(new Error('音乐 API 请求失败: ' + err.message))
      let body = resp.body
      if (typeof body === 'string') {
        try { body = JSON.parse(body) } catch (e) { body = null }
      }
      resolve({ url, status: resp.statusCode, body })
    })
  })
}

async function gdRequest (params, timeout = 20000) {
  const key = 'gd:' + JSON.stringify(params)
  const hit = cacheGet(key)
  if (hit) return hit
  const ttl = CACHE_TTL[params.types] || 60e3
  const task = async () => {
    let lastErr
    for (let i = 0; i < 3; i++) {
      try {
        const r = await rawRequest(params, timeout)
        if (r.status === 200) {
          const value = { url: r.url, body: r.body, status: r.status }
          cacheSet(key, value, ttl)
          return value
        }
        lastErr = new Error('音乐 API 状态码 ' + r.status)
        if (r.status === 403 || r.status === 429 || r.status >= 500) { await sleep(700 * (i + 1)); continue }
        break
      } catch (e) { lastErr = e; await sleep(500 * (i + 1)) }
    }
    throw lastErr || new Error('音乐 API 请求失败')
  }
  return enqueue(task)
}

/* 搜索 */
async function search (keyword, platform = 'wy', page = 1, limit = 30) {
  const source = toGdSource(platform)
  const { body } = await gdRequest({ types: 'search', source, name: keyword, count: limit, pages: page })
  if (!Array.isArray(body)) throw new Error(body && body.detail ? body.detail : '搜索无结果')
  return body.map((it) => ({
    id: String(it.id),
    urlId: String(it.url_id || it.id),
    lyricId: String(it.lyric_id || it.id),
    picId: String(it.pic_id || ''),
    name: it.name || '未知歌曲',
    singer: Array.isArray(it.artist) ? it.artist.join(' / ') : String(it.artist || '未知歌手'),
    album: it.album || '',
    source: platform,
    gdSource: source,
    duration: null,
  }))
}

/* 播放地址 */
async function musicUrl (id, platform = 'wy', br = 320) {
  const { body } = await gdRequest({ types: 'url', source: toGdSource(platform), id, br })
  if (!body || !body.url) throw new Error(body && body.detail ? body.detail : '无法获取播放地址')
  return { url: body.url, br: body.br || br, size: body.size || 0 }
}

/* 歌词 */
async function lyric (id, platform = 'wy') {
  const { body } = await gdRequest({ types: 'lyric', source: toGdSource(platform), id })
  return { lyric: (body && body.lyric) || '', tlyric: (body && body.tlyric) || '' }
}

/* 封面 */
async function pic (id, platform = 'wy', size = 300) {
  const { body } = await gdRequest({ types: 'pic', source: toGdSource(platform), id, size })
  return (body && body.url) || ''
}

module.exports = { gdRequest, search, musicUrl, lyric, pic, toGdSource, API_BASE }
