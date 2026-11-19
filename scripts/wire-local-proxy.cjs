'use strict'
/* 把 LocalProxy 接到 NapiBridge 和 MainActivity */
const fs = require('node:fs')

/* ---------- 1. NapiBridge ---------- */
const bp = 'apk-build/app/src/com/phonograph/player/NapiBridge.java'
let b = fs.readFileSync(bp, 'utf8')

if (b.includes('proxyPort()')) {
  console.log('NapiBridge 已有 proxyPort')
} else {
  const idx = b.lastIndexOf('}')
  const method = [
    '',
    '    /* 本地代理端口（0 表示没启动） */',
    '    @JavascriptInterface',
    '    public int proxyPort() {',
    '        return LocalProxy.getPort();',
    '    }',
    '',
    '    /* 把第三方直链转成 http://127.0.0.1:port/s?u=...&r=... */',
    '    @JavascriptInterface',
    '    public String proxyUrl(String url, String referer) {',
    '        int port = LocalProxy.getPort();',
    '        if (port <= 0 || url == null || url.length() < 8) return url;',
    '        try {',
    '            String r = (referer == null || referer.length() == 0) ? LocalProxy.refererOf(url) : referer;',
    '            return "http://127.0.0.1:" + port + "/s?u="',
    '                    + java.net.URLEncoder.encode(url, "UTF-8")',
    '                    + "&r="',
    '                    + java.net.URLEncoder.encode(r, "UTF-8");',
    '        } catch (Exception e) {',
    '            return url;',
    '        }',
    '    }',
    ''
  ].join('\n')
  b = b.slice(0, idx) + method + b.slice(idx)
  fs.writeFileSync(bp, b, 'utf8')
  console.log('NapiBridge 已加 proxyPort / proxyUrl')
}

/* ---------- 2. MainActivity ---------- */
const mp = 'apk-build/app/src/com/phonograph/player/MainActivity.java'
let m = fs.readFileSync(mp, 'utf8')

if (m.includes('LocalProxy.start()')) {
  console.log('MainActivity 已启动 LocalProxy')
} else {
  const anchor = 'web.addJavascriptInterface(new NapiBridge(web, lyric), "NAPI");'
  if (m.includes(anchor)) {
    m = m.replace(anchor, anchor + '\n        try { LocalProxy.start(); } catch (Throwable ignore) { }')
    fs.writeFileSync(mp, m, 'utf8')
    console.log('MainActivity 已启动 LocalProxy')
  } else {
    console.log('⚠ MainActivity 未找到锚点')
  }
}
