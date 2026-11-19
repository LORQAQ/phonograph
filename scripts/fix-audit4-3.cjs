'use strict'
/* 修 audit4-server 的 P0-1 / P0-2 / P1-1 / P1-3 */
const path = require('node:path')
process.chdir(path.resolve(__dirname, '..'))
const fs = require('node:fs')
const done = []
const miss = []

/* ================= P0-1: cacheSet 多包一层 ================= */
{
  const p = 'app/server.js'
  let s = fs.readFileSync(p, 'utf8')

  /* 找所有 cacheSet 调用里传了 { value: ..., exp: ... } 的 */
  const bad = s.match(/cacheSet\(urlCache,\s*cacheKey,\s*\{\s*value:[^}]*exp:[^}]*\}[^)]*\)/g) || []
  console.log('发现 ' + bad.length + ' 处多包一层:')
  bad.forEach((b) => console.log('  ' + b.replace(/\s+/g, ' ').slice(0, 130)))

  for (const b of bad) {
    /* 把 { value: X, exp: Y } 拆成 X */
    const m = b.match(/cacheSet\(urlCache,\s*(cacheKey),\s*\{\s*value:\s*([\s\S]*?),\s*exp:\s*[\s\S]*?\}\s*,\s*([^)]+)\)/)
    if (m) {
      const fixed = 'cacheSet(urlCache, ' + m[1] + ', ' + m[2] + ', ' + m[3] + ')'
      s = s.replace(b, fixed)
      console.log('  → ' + fixed.replace(/\s+/g, ' ').slice(0, 130))
    }
  }

  if (bad.length > 0) done.push('P0-1 cacheSet 去掉多余包装（' + bad.length + ' 处）')
  else miss.push('P0-1 cacheSet')

  fs.writeFileSync(p, s, 'utf8')
}

/* ================= P0-2: Origin:null 不信任 + 写请求要 JSON ================= */
{
  const p = 'app/server.js'
  let s = fs.readFileSync(p, 'utf8')

  const old1 = `  /* P1-2: 无 Origin 的本地请求（curl / 外壳）放行；'null' 只出现在沙箱 iframe / file:// */
  if (!o) return true
  if (o === 'null') return true`
  if (s.includes(old1)) {
    s = s.replace(old1, `  /* 无 Origin 的本地请求（curl / 外壳）放行。
     'null' 是沙箱 iframe / file:// 的 Origin —— 任意网页都能造出来，
     放行等于把全部写接口暴露给任何网站，必须拒绝。 */
  if (!o) return true
  if (o === 'null') return false`)
    done.push('P0-2 Origin:null 改为拒绝')
  } else {
    const i = s.indexOf("if (o === 'null') return true")
    if (i > 0) {
      s = s.replace("if (o === 'null') return true", "if (o === 'null') return false   /* P0-2: 沙箱 iframe 可伪造 */")
      done.push('P0-2 Origin:null 改为拒绝（宽松匹配）')
    } else {
      miss.push('P0-2 Origin null')
    }
  }

  /* 写请求强制 application/json（挡住 text/plain 的 CORS 简单请求） */
  const guardOld = `      if (WRITE_PATHS.has(pathname) && req.method !== 'POST' && req.method !== 'PUT' && !isPlaylistRead) {
        return json(res, 405, { error: '仅支持 POST' })
      }`
  if (s.includes(guardOld)) {
    s = s.replace(guardOld, `${guardOld}

      /* P0-2: 写接口必须是 application/json。
         浏览器发 text/plain 的 POST 属于 CORS「简单请求」，不发预检、请求真的会到本机；
         要求 JSON 后，跨站要发 JSON 就必须过预检，而预检会因为我们不回 CORS 头而失败。 */
      const isWrite = (req.method === 'POST' || req.method === 'PUT')
      if (isWrite) {
        const ct = String(req.headers['content-type'] || '').toLowerCase()
        if (WRITE_PATHS.has(pathname) || pathname === '/api/settings' || pathname === '/api/download') {
          if (!ct.startsWith('application/json')) {
            return json(res, 415, { error: '写接口需要 application/json' })
          }
        }
      }`)
    done.push('P0-2 写接口强制 JSON')
  } else {
    miss.push('P0-2 写名单判定')
  }

  fs.writeFileSync(p, s, 'utf8')
}

/* ================= P1-1: 备用接口做成状态机 ================= */
{
  const p = 'app/lib/kugou-gcid.js'
  let s = fs.readFileSync(p, 'utf8')

  const old = `  const all = []
  const seen = new Set()
  let total = meta.count || 0
  let usedAlt = false

  for (let page = 1; page <= 100 && all.length < maxSongs; page++) {
    let r = null
    try {
      r = await getSongPage(globalId, page, pageSize)
    } catch (e) {
      /* song_v2 被限流或失败，改用备选接口重来 */
      if (!usedAlt) {
        usedAlt = true
        try {
          r = await getSongPageAlt(globalId, page, pageSize)
        } catch (e2) {
          if (page === 1) throw new Error('酷狗歌单拉取失败：' + e2.message)
          break
        }
      } else if (page === 1) {
        throw new Error('酷狗歌单拉取失败：' + e.message)
      } else {
        break
      }
    }

    if (!r) break
    if (r.total > total) total = r.total
    const list = r.list || []
    if (!list.length) break

    for (const x of list) {
      const s = mapKgSong(x)
      if (!s) continue
      if (seen.has(s.id)) continue
      seen.add(s.id)
      all.push(s)
      if (all.length >= maxSongs) break
    }

    if (total && all.length >= total) break
    if (list.length < pageSize) break
    /* 温和一点，别触发限流 */
    await new Promise((r2) => setTimeout(r2, 200))
  }`

  const neu = `  const all = []
  const seen = new Set()
  let total = meta.count || 0
  /* P1-1: 把「用哪个接口」做成状态，而不是一次性开关。
     之前 usedAlt 置 true 后，第 2 页仍先打 song_v2，再失败就 break ——
     800 首的歌单只能拿到 300 首。 */
  let backend = 'web'

  for (let page = 1; page <= 100 && all.length < maxSongs; page++) {
    let r = null
    let lastErr = null
    const plan = backend === 'alt' ? ['alt'] : ['web', 'alt']
    for (const b of plan) {
      try {
        r = b === 'web'
          ? await getSongPage(globalId, page, pageSize)
          : await getSongPageAlt(globalId, page, pageSize)
        backend = b      /* 记住能用的那个，后续页不再试坏的 */
        break
      } catch (e) {
        lastErr = e
      }
    }
    if (!r) {
      if (page === 1) throw new Error('酷狗歌单拉取失败：' + (lastErr && lastErr.message))
      break
    }

    if (r.total > total) total = r.total
    const list = r.list || []
    if (!list.length) break

    /* P2-12: 以「本页有没有新增有效歌曲」作为终止条件，
       而不是 list.length < pageSize（上游钳制页大小时会误判结束） */
    let added = 0
    for (const x of list) {
      const sm = mapKgSong(x)
      if (!sm) continue
      if (seen.has(sm.id)) continue
      seen.add(sm.id)
      all.push(sm)
      added++
      if (all.length >= maxSongs) break
    }
    if (!added) break
    if (total && all.length >= total) break
    /* 温和一点，别触发限流 */
    await new Promise((r2) => setTimeout(r2, 200))
  }`

  if (s.includes(old)) {
    s = s.replace(old, neu)
    done.push('P1-1 备用接口状态机 + P2-12 终止条件')
  } else {
    miss.push('P1-1 翻页循环')
  }

  /* ================= P1-3: remark 不覆盖歌名，改成 alias ================= */
  const p13old = `  if (!songName) songName = fileName
  if (remark && remark !== songName) songName = remark
  if (!songName) songName = '未知歌曲'`
  if (s.includes(p13old)) {
    s = s.replace(p13old, `  if (!songName) songName = fileName
  if (!songName) songName = '未知歌曲'
  /* P1-3: remark 不是「中文名」，是任意备注（翻译名、电影主题曲说明……）。
     无条件覆盖会把《勋章》变成「《我是证人》电影主题曲」，搜原名也搜不到。
     原名保留，备注放进 alias。 */
  const alias = (remark && remark !== songName) ? remark : ''`)
    done.push('P1-3 remark 改 alias')
  } else {
    miss.push('P1-3 remark')
  }

  /* 返回值里带上 alias */
  const retOld = `    name: songName,
    singer: singer || '未知歌手',`
  if (s.includes(retOld)) {
    s = s.replace(retOld, `    name: songName,
    alias: alias,
    singer: singer || '未知歌手',`)
    done.push('P1-3 alias 进返回值')
  }

  /* ================= P2-5: 歌单封面替换 {size} ================= */
  const covOld = `    cover: d.imgurl || d.img_url || '',`
  if (s.includes(covOld)) {
    s = s.replace(covOld, `    cover: String(d.imgurl || d.img_url || '').replace('{size}', '400'),   /* P2-5: 不替换是 404 破图 */`)
    done.push('P2-5 歌单封面替换 {size}')
  }

  /* ================= P2-4: request 用 Buffer.concat 防中文截断 ================= */
  const reqOld = `      let d = ''
      res.on('data', (c) => { d += c })
      res.on('end', () => {
        let j = null
        try { j = JSON.parse(d) } catch (e) { }
        resolve({ status: res.statusCode, body: d, json: j })
      })`
  if (s.includes(reqOld)) {
    s = s.replace(reqOld, `      /* P2-4/P2-10: 用 Buffer.concat 再整体解码 —— d += chunk 会把跨 TCP 分片的
         多字节中文切成 U+FFFD；顺便加 8MB 上限 */
      const chunks = []
      let size = 0
      res.on('data', (c) => {
        size += c.length
        if (size > 8 * 1024 * 1024) { try { res.destroy() } catch (e) { } reject(new Error('响应体过大')); return }
        chunks.push(c)
      })
      res.on('error', reject)
      res.on('end', () => {
        const d = Buffer.concat(chunks).toString('utf8')
        let j = null
        try { j = JSON.parse(d) } catch (e) { }
        resolve({ status: res.statusCode, body: d, json: j })
      })`)
    done.push('P2-4 request 用 Buffer.concat + 8MB 上限')
  }

  /* ================= P2-11: 去掉无条件 rejectUnauthorized:false ================= */
  const tlsOld = `      timeout: opts.timeout || 20000,
      rejectUnauthorized: false,`
  if (s.includes(tlsOld)) {
    s = s.replace(tlsOld, `      timeout: opts.timeout || 20000,
      /* P2-11: 三个酷狗域名证书都正常，无条件关校验只是给中间人留门 */
      ...(opts.insecure ? { rejectUnauthorized: false } : {}),`)
    done.push('P2-11 按需才关 TLS 校验')
  }

  fs.writeFileSync(p, s, 'utf8')
}

/* ================= P2-7: detect 支持裸 gcid ================= */
{
  const p = 'app/lib/playlist-import.js'
  let s = fs.readFileSync(p, 'utf8')
  const old = `  if (/^\\d{4,}$/.test(s)) return { platform: 'wy', id: s }`
  if (s.includes(old) && !s.includes('裸 gcid')) {
    s = s.replace(old, `  /* P2-7: 用户从 App 复制的常常只有 gcid_xxx，没有 URL 外壳 */
  if (/^gcid_[a-z0-9]{8,}$/i.test(s)) return { platform: 'kg', id: s }
  if (/^[a-z0-9]{14,}$/i.test(s) && /[a-z]/i.test(s)) return { platform: 'kg', id: s }
  if (/^\\d{4,}$/.test(s)) return { platform: 'wy', id: s }`)
    done.push('P2-7 detect 支持裸 gcid')
  }

  /* P3-4: gcid 前缀大小写 */
  const gOld = `    const gid = String(specialid).startsWith('gcid_') ? String(specialid) : 'gcid_' + String(specialid)`
  if (s.includes(gOld)) {
    s = s.replace(gOld, `    /* P3-4: 正则用 /i 放行了大写，这里也要大小写不敏感 */
    const gid = /^gcid_/i.test(String(specialid))
      ? ('gcid_' + String(specialid).replace(/^gcid_/i, ''))
      : ('gcid_' + String(specialid))`)
    done.push('P3-4 gcid 前缀大小写统一')
  }

  /* P1-2: total/truncated 透传 */
  const rOld = `    return { platform: 'kg', name: r.name || '酷狗歌单', cover: r.cover || '', songs: r.songs }`
  if (s.includes(rOld)) {
    s = s.replace(rOld, `    return {
      platform: 'kg',
      name: r.name || '酷狗歌单',
      cover: r.cover || '',
      songs: r.songs,
      total: r.total,          /* P1-2: 透出总数，好让前端提示「只取到 N/M 首」 */
      truncated: !!r.truncated,
    }`)
    done.push('P1-2 total/truncated 透传')
  }

  fs.writeFileSync(p, s, 'utf8')
}

console.log('=== 已完成 ===')
done.forEach((d) => console.log('  ✓ ' + d))
if (miss.length) {
  console.log('=== 未匹配 ===')
  miss.forEach((m) => console.log('  ⚠ ' + m))
}
