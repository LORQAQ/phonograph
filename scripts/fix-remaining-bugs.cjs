'use strict'
/* 第 6 批：修完剩余 bug */
const path = require('node:path')
process.chdir(path.resolve(__dirname, '..'))
const fs = require('node:fs')
const done = []
const miss = []

/* ================= B32: proxyStream 断流让前端能识别 ================= */
{
  const p = 'app/server.js'
  let s = fs.readFileSync(p, 'utf8')
  const old = `    try { res.destroy() } catch (e) { }
  }`
  /* 找 fail 函数里的 res.destroy */
  const idx = s.indexOf('const fail = (code, msg) => {')
  if (idx > 0) {
    const seg = s.slice(idx, idx + 700)
    if (seg.includes('res.destroy()') && !seg.includes('UPSTREAM_ABORTED')) {
      s = s.slice(0, idx) + seg.replace('try { res.destroy() } catch (e) { }',
        `/* B32: 头已发出时改不了状态码，但可以带上错误名，
           让前端 onAudioError 能判定「已收部分数据后被重置」并换源重试 */
    try { res.destroy(new Error('UPSTREAM_ABORTED')) } catch (e) { }`) + s.slice(idx + 700)
      done.push('B32 断流带错误名')
    } else {
      done.push('B32 已带错误名')
    }
  } else {
    miss.push('B32 fail 函数')
  }

  /* ================= B30: playlist 只读动作放行 GET ================= */
  const wOld = `      if (WRITE_PATHS.has(pathname) && req.method !== 'POST' && req.method !== 'PUT') {
        return json(res, 405, { error: '仅支持 POST' })
      }`
  if (s.includes(wOld)) {
    s = s.replace(wOld, `      /* B30: /api/playlist 的 preview / list 是只读的，GET 也要放行 */
      const READ_ACTIONS = new Set(['preview', 'list', ''])
      const isPlaylistRead = pathname === '/api/playlist' && READ_ACTIONS.has(u.searchParams.get('action') || '')
      if (WRITE_PATHS.has(pathname) && req.method !== 'POST' && req.method !== 'PUT' && !isPlaylistRead) {
        return json(res, 405, { error: '仅支持 POST' })
      }`)
    done.push('B30 playlist 只读放行 GET')
  } else {
    miss.push('B30 写名单判定')
  }

  /* ================= B7: 接上 guard（token 校验）================= */
  const gOld = `      if (!sameOrigin(req)) {
        return json(res, 403, { error: '来源不允许' })
      }`
  if (s.includes(gOld) && !s.includes('if (!guard(req, res')) {
    s = s.replace(gOld, `      /* B7: 统一守卫（Origin + 可选 token）。token 由外壳通过 env 注入，
         前端可以用 X-Phonograph-Token 带；不带也放行（本地单机场景） */
      if (!guard(req, res, false)) return`)
    done.push('B7 接上 guard')
  }

  /* /api/health 下发 token（仅本机 Origin 可取） */
  const hOld = `  async '/api/health' () { return { ok: true, version: '1.0.0', pid: process.pid, platform: process.platform } },`
  if (s.includes(hOld)) {
    s = s.replace(hOld, `  async '/api/health' () {
    return {
      ok: true, version: '1.0.0', pid: process.pid, platform: process.platform,
      /* B7: 外壳/前端可以拿这个 token 带 X-Phonograph-Token 头 */
      token: SESSION_TOKEN,
    }
  },`)
    done.push('B7 health 下发 token')
  }

  fs.writeFileSync(p, s, 'utf8')
}

/* ================= B75: newSongs 回落到网易云 ================= */
{
  const p = 'mobile/www/api-mobile.js'
  let s = fs.readFileSync(p, 'utf8')
  const old = `      if (source === 'tx') return { platform: source, offset, playlists: await NET_TX.recommendPlaylists(offset, limit), newSongs: [] }
      if (source === 'kg') return { platform: source, offset, playlists: await NET_KG.recommendPlaylists(offset, limit), newSongs: [] }`
  if (s.includes(old)) {
    s = s.replace(old, `      /* B75: tx/kg 本来就没有 newSongs 实现，统一回落到网易云的「新歌速递」
         （跨平台新歌是通用的，总比永远空白好） */
      if (source === 'tx') {
        const playlists = await NET_TX.recommendPlaylists(offset, limit)
        const newSongs = (NET_WY.newSongs ? await NET_WY.newSongs(10).catch(() => []) : [])
        return { platform: source, offset, playlists, newSongs }
      }
      if (source === 'kg') {
        const playlists = await NET_KG.recommendPlaylists(offset, limit)
        const newSongs = (NET_WY.newSongs ? await NET_WY.newSongs(10).catch(() => []) : [])
        return { platform: source, offset, playlists, newSongs }
      }`)
    done.push('B75 newSongs 回落到 wy')
  } else {
    const i = s.indexOf("if (source === 'tx') return { platform: source")
    if (i > 0) console.log('  B75 现场:\n' + s.slice(i, i + 400))
    else miss.push('B75 discover')
  }
  fs.writeFileSync(p, s, 'utf8')
}

/* ================= Java: B80 自愈 / B82 readLine / B83 CT ================= */
{
  const base = path.resolve(process.cwd(), '..', 'apk-build', 'app', 'src', 'com', 'phonograph', 'player')

  /* --- B80: getPort() 惰性自愈 --- */
  const lp = path.join(base, 'LocalProxy.java')
  let s = fs.readFileSync(lp, 'utf8')
  const gOld = `    public static synchronized int getPort () {
        if (!acceptorAlive) return 0;
        return port;
    }`
  if (s.includes(gOld)) {
    s = s.replace(gOld, `    public static synchronized int getPort () {
        /* B80: acceptor 线程死掉后 port 会归零，下游就静默直连（丢 Referer → 403）。
           这里做惰性自愈：发现不健康就重启一次。 */
        if (port <= 0 || !acceptorAlive) {
            start();
        }
        return acceptorAlive ? port : 0;
    }`)
    done.push('B80 getPort 惰性自愈')
  }

  /* --- B82: readLine 区分 EOF / 超长 --- */
  const rlOld = `    private static String readLine (InputStream in) {
        StringBuilder sb = new StringBuilder(128);
        try {
            int c;
            while ((c = in.read()) != -1) {
                if (c == '\\n') break;
                if (c != '\\r') sb.append((char) c);
                /* B82: 单行上限，防 100MB 不带换行的请求头打爆内存 */
                if (sb.length() > MAX_LINE) throw new IOException("line too long");
            }
            if (c == -1 && sb.length() == 0) return null;
            return sb.toString();
        } catch (IOException e) {
            return null;
        }
    }`
  if (s.includes(rlOld)) {
    s = s.replace(rlOld, `    /* B82: 用哨兵值区分三种状态，别把「超长」和「EOF」混成 null */
    private static final String LINE_TOO_LONG = "\\u0000TOO_LONG";

    private static String readLine (InputStream in) {
        StringBuilder sb = new StringBuilder(128);
        try {
            int c;
            while ((c = in.read()) != -1) {
                if (c == '\\n') break;
                if (c != '\\r') sb.append((char) c);
                if (sb.length() > MAX_LINE) return LINE_TOO_LONG;
            }
            if (c == -1 && sb.length() == 0) return null;
            return sb.toString();
        } catch (IOException e) {
            return null;
        }
    }`)

    /* header 循环里检查哨兵 */
    const hdrOld = `            while ((line = readLine(rawIn)) != null && line.length() > 0) {
                if (++hdrCount > MAX_HEADERS) { fail(out, 431, "too many headers"); return; }`
    if (s.includes(hdrOld)) {
      s = s.replace(hdrOld, `            while ((line = readLine(rawIn)) != null && line.length() > 0) {
                if (LINE_TOO_LONG == line) { fail(out, 431, "line too long"); return; }
                if (++hdrCount > MAX_HEADERS) { fail(out, 431, "too many headers"); return; }`)
      done.push('B82 readLine 区分超长')
    }

    /* 请求行也检查 */
    const reqOld = `            String requestLine = readLine(rawIn);
            if (requestLine == null) { return; }`
    if (s.includes(reqOld)) {
      s = s.replace(reqOld, `            String requestLine = readLine(rawIn);
            if (requestLine == null) { fail(out, 400, "empty request"); return; }
            if (LINE_TOO_LONG == requestLine) { fail(out, 431, "line too long"); return; }`)
      done.push('B82 请求行也检查')
    }
  } else {
    miss.push('B82 readLine')
  }
  fs.writeFileSync(lp, s, 'utf8')

  /* --- B83: Content-Type 大小写不敏感，只设一次 --- */
  const nb = path.join(base, 'NapiBridge.java')
  let n = fs.readFileSync(nb, 'utf8')
  const ctOld = `                /* B83: 尊重调用方传入的 Content-Type，别一律写死 json */
                String __ct = (headers == null) ? null : headers.optString("Content-Type", null);
                conn.setRequestProperty("Content-Type", __ct == null || __ct.isEmpty() ? "application/json" : __ct);`
  if (n.includes(ctOld)) {
    n = n.replace(ctOld, `                /* B83: optString 区分大小写，调用方用小写 content-type 时会漏判，
                   导致同名不同大小写的头被追加两次。这里扫一遍找出真实值。 */
                String __ct = null;
                if (headers != null) {
                    java.util.Iterator<String> __it = headers.keys();
                    while (__it.hasNext()) {
                        String __k = __it.next();
                        if (__k != null && __k.equalsIgnoreCase("Content-Type")) {
                            __ct = headers.optString(__k, null);
                            break;
                        }
                    }
                }
                conn.setRequestProperty("Content-Type", (__ct == null || __ct.isEmpty()) ? "application/json" : __ct);`)
    done.push('B83 Content-Type 大小写不敏感')
  } else {
    miss.push('B83 CT')
  }
  fs.writeFileSync(nb, n, 'utf8')
}

console.log('=== 已完成 ===')
done.forEach((d) => console.log('  ✓ ' + d))
if (miss.length) {
  console.log('=== 未匹配 ===')
  miss.forEach((m) => console.log('  ⚠ ' + m))
}
