'use strict'
/* 修 audit4-mobile 的 M2/M3/M4/M6 */
const path = require('node:path')
process.chdir(path.resolve(__dirname, '..'))
const fs = require('node:fs')
const done = []
const miss = []

/* ================= M2: 手机端 gcid 限流重试 ================= */
{
  const p = 'mobile/www/api-mobile.js'
  let s = fs.readFileSync(p, 'utf8')
  const old = `async function __kgDecodeGcid (gcid) {
  const params = 'dfid=-&appid=1005&mid=0&clientver=20109&clienttime=640612895&uuid=-'
  const body = JSON.stringify({ ret_info: 1, data: [{ id: gcid, id_type: 2 }] })
  const sign = __kgSign(params, 'android', body)
  const r = await __kgReq('https://t.kugou.com/v1/songlist/batch_decode?' + params + '&signature=' + sign, {
    method: 'POST', body, ua: __KG_UA_ANDROID, headers: { Referer: 'https://m.kugou.com/' },
  })
  const j = r.json
  if (!j) throw new Error('gcid 解码失败：返回不是 JSON')
  if (j.err_code && j.err_code !== 0) throw new Error('gcid 解码失败：err_code=' + j.err_code)
  const item = j.data && j.data.list && j.data.list[0]
  const gid = item && item.global_collection_id
  if (!gid) throw new Error('gcid 解码失败：拿不到 global_collection_id')
  return gid
}`

  const neu = `async function __kgDecodeGcid (gcid, n) {
  /* M2: 与电脑端对齐 —— 20028 是限流不是永久失败。
     写死的 clienttime/mid 会让重试永远是同一个签名请求，永远恢复不了。 */
  const attempt = n || 0
  const ct = String(Date.now() + attempt * 7919)
  const params = 'dfid=-&appid=1005&mid=' + (attempt === 0 ? '0' : ct) +
    '&clientver=20109&clienttime=' + ct + '&uuid=-'
  const body = JSON.stringify({ ret_info: 1, data: [{ id: gcid, id_type: 2 }] })
  const sign = __kgSign(params, 'android', body)
  const r = await __kgReq('https://t.kugou.com/v1/songlist/batch_decode?' + params + '&signature=' + sign, {
    method: 'POST', body, ua: __KG_UA_ANDROID, headers: { Referer: 'https://m.kugou.com/' },
  })
  const j = r.json
  if (!j) throw new Error('gcid 解码失败：返回不是 JSON')
  const code = Number(j.err_code || 0)
  if (code === 20028 || code === 20010) {
    if (attempt < 3) {
      await new Promise((res) => setTimeout(res, 1200 * (attempt + 1)))
      return __kgDecodeGcid(gcid, attempt + 1)
    }
    throw new Error('酷狗限流了，请等一两分钟再导入')
  }
  if (code !== 0) throw new Error('gcid 解码失败：err_code=' + code)
  const item = j.data && j.data.list && j.data.list[0]
  const gid = item && item.global_collection_id
  if (!gid) throw new Error('gcid 解码失败：拿不到 global_collection_id')
  return gid
}`

  if (s.includes(old)) {
    s = s.replace(old, neu)
    done.push('M2 手机端 gcid 限流重试')
  } else {
    miss.push('M2 __kgDecodeGcid')
  }

  /* ============ M4: gcid 大小写统一（正则有 i，拼装也要去前缀） ============ */
  const m4old = `const gid = String(id).startsWith('gcid_') ? String(id) : 'gcid_' + id`
  if (s.includes(m4old)) {
    s = s.replace(m4old, `/* M4: 正则用 /i 放行了大写，拼装也要大小写不敏感 */
        const gid = /^gcid_/i.test(id) ? ('gcid_' + String(id).replace(/^gcid_/i, '')) : ('gcid_' + id)`)
    done.push('M4 gcid 大小写统一')
  }

  /* ============ M3: truncated 透传 ============ */
  const m3old = `  if (!all.length) throw new Error('酷狗歌单是空的')
  return { platform: 'kg', name: meta.name || '酷狗歌单', cover: meta.cover || '', songs: all, total: total || all.length }`
  if (s.includes(m3old)) {
    s = s.replace(m3old, `  if (!all.length) throw new Error('酷狗歌单是空的')
  /* M3: 中途被限流截断时要告诉上层，别让用户以为导全了 */
  return {
    platform: 'kg',
    name: meta.name || '酷狗歌单',
    cover: meta.cover || '',
    songs: all,
    total: total || all.length,
    got: all.length,
    truncated: (total || 0) > all.length,
  }`)
    done.push('M3 truncated 透传')
  } else {
    miss.push('M3 return')
  }

  /* ============ M8: __kgMd5 不要把计算错误当"缺库" ============ */
  const m8old = `function __kgMd5 (str) {
  try {
    if (window.CryptoJS && window.CryptoJS.MD5) return window.CryptoJS.MD5(str).toString()
  } catch (e) { }
  /* 兜底：极简 md5 不应该走到这里，直接抛 */
  throw new Error('缺少 CryptoJS.MD5，无法签名')
}`
  if (s.includes(m8old)) {
    s = s.replace(m8old, `function __kgMd5 (str) {
  /* M8: 别把计算异常也报成「缺库」，那样排查方向全错 */
  if (!window.CryptoJS || !window.CryptoJS.MD5) throw new Error('缺少 CryptoJS.MD5，无法签名')
  return window.CryptoJS.MD5(String(str)).toString()
}`)
    done.push('M8 md5 错误信息区分')
  }

  /* ============ M10: 空时长不显示 0:00 ============ */
  const m10old = `function __kgFmtTime (sec) {
  const t = Math.max(0, Math.round(Number(sec) || 0))
  return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0')
}`
  if (s.includes(m10old)) {
    s = s.replace(m10old, `function __kgFmtTime (sec) {
  const t = Math.max(0, Math.round(Number(sec) || 0))
  if (!t) return ''    /* M10: 与其它平台的 msToText 保持一致，空时长不显示 0:00 */
  return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0')
}`)
    done.push('M10 空时长不显示 0:00')
  }

  /* ============ M15: 纯数字不判成 gcid ============ */
  const m15old = "if (/^gcid_/i.test(id) || /^[a-z0-9]{14,}$/i.test(id)) {"
  if (s.includes(m15old)) {
    s = s.replace(m15old, `/* M15: 14 位以上纯数字是老的 specialid，不是 gcid */
      if (/^gcid_/i.test(id) || (/^[a-z0-9]{14,}$/i.test(id) && !/^[0-9]+$/.test(id))) {`)
    done.push('M15 纯数字不判 gcid')
  }

  fs.writeFileSync(p, s, 'utf8')
}

/* ================= M6: lyricShow 消费返回值 ================= */
{
  const p = 'public/app.js'
  let s = fs.readFileSync(p, 'utf8')
  const old = `window.NAPI.lyricShow(`
  if (s.includes(old) && !s.includes('M6: 消费 lyricShow 返回值')) {
    const i = s.indexOf(old)
    const le = s.indexOf('\n', i)
    const line = s.slice(i, le)
    console.log('M6 现场: ' + line.trim().slice(0, 100))
    /* 找到这条语句所在行，改成带返回值判断 */
    const ls = s.lastIndexOf('\n', i) + 1
    const stmt = s.slice(ls, le)
    s = s.slice(0, ls) + `/* M6: 消费 lyricShow 返回值，开启失败时别骗用户 */
        const __lyOk = (function () { try { return ${stmt.trim()} } catch (e) { return false } })()
        if (__lyOk === false) { toast('桌面歌词打开失败（可在系统设置里允许「显示在其他应用上层」）', 3200); return }` + s.slice(le + 1)
    done.push('M6 lyricShow 消费返回值')
  } else if (s.includes('M6: 消费 lyricShow 返回值')) {
    done.push('M6 已消费返回值')
  }
  fs.writeFileSync(p, s, 'utf8')
}

console.log('=== 已完成 ===')
done.forEach((d) => console.log('  ✓ ' + d))
if (miss.length) {
  console.log('=== 未匹配 ===')
  miss.forEach((m) => console.log('  ⚠ ' + m))
}
