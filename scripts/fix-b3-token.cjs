'use strict'
/* B5 跟进：proxyUrl 带上 token；MainActivity.onDestroy 调 stop() */
const fs = require('node:fs')

const BP = 'apk-build/app/src/com/phonograph/player/NapiBridge.java'
let b = fs.readFileSync(BP, 'utf8')
const done = []

/* --- proxyUrl 加 token --- */
const oldUrl = `            return "http://127.0.0.1:" + port + "/s?u="
                    + java.net.URLEncoder.encode(url, "UTF-8")
                    + "&r="
                    + java.net.URLEncoder.encode(r, "UTF-8");`

const newUrl = `            return "http://127.0.0.1:" + port + "/s?t=" + LocalProxy.token()
                    + "&u=" + java.net.URLEncoder.encode(url, "UTF-8")
                    + "&r=" + java.net.URLEncoder.encode(r, "UTF-8");`

if (b.includes(oldUrl)) {
  b = b.replace(oldUrl, newUrl)
  done.push('proxyUrl 带 token')
} else if (b.includes('proxyUrl')) {
  /* 宽松匹配：找 return "http://127.0.0.1:" 那一段 */
  const i = b.indexOf('return "http://127.0.0.1:"')
  if (i > 0) {
    const end = b.indexOf(';', i) + 1
    b = b.slice(0, i) + newUrl.trim() + b.slice(end)
    done.push('proxyUrl 带 token（宽松）')
  } else {
    console.log('⚠ proxyUrl 未匹配')
  }
} else {
  console.log('⚠ 没有 proxyUrl')
}

fs.writeFileSync(BP, b, 'utf8')
console.log('=== NapiBridge ===')
done.forEach((d) => console.log('  ✓ ' + d))

/* --- MainActivity.onDestroy 调 stop() --- */
const MP = 'apk-build/app/src/com/phonograph/player/MainActivity.java'
let m = fs.readFileSync(MP, 'utf8')
if (m.includes('LocalProxy.stop()')) {
  console.log('=== MainActivity ===\n  - 已有 stop()')
} else {
  /* 找 onDestroy */
  const od = m.indexOf('protected void onDestroy')
  if (od > 0) {
    const brace = m.indexOf('{', od)
    m = m.slice(0, brace + 1) + '\n        try { LocalProxy.stop(); } catch (Throwable ignore) { }' + m.slice(brace + 1)
    fs.writeFileSync(MP, m, 'utf8')
    console.log('=== MainActivity ===\n  ✓ onDestroy 调用 LocalProxy.stop()')
  } else {
    console.log('=== MainActivity ===\n  ⚠ 没有 onDestroy')
  }
}
