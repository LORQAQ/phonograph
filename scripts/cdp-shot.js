'use strict'
/* 通过 WebView2 的 CDP 远程调试端口截图：node scripts/cdp-shot.js [out.png] */
const fs = require('node:fs')

const OUT = process.argv[2] || 'shot-cdp.png'
const PORT = 9333

async function main () {
  const res = await fetch('http://127.0.0.1:' + PORT + '/json/list')
  const targets = await res.json()
  const page = targets.find((t) => t.type === 'page' && /^http:\/\/127\.0\.0\.1:37621\/$/.test(t.url)) || targets.find((t) => t.type === 'page' && !/lyric-window/.test(t.url)) || targets.find((t) => t.type === 'page')
  if (!page) { console.log('未找到页面目标：', targets.map((t) => t.type + ':' + t.url).join(' | ')); process.exit(1) }
  console.log('target:', page.url)

  const ws = new WebSocket(page.webSocketDebuggerUrl)
  let id = 0
  const pending = new Map()
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id
    pending.set(mid, { resolve, reject })
    ws.send(JSON.stringify({ id: mid, method, params }))
  })

  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) p.reject(new Error(msg.error.message))
      else p.resolve(msg.result)
    }
  })

  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j) })

  // 等页面稳定
  await send('Page.enable')
  const vp = process.argv[5]
  if (vp) {
    const [w, h] = vp.split('x').map(Number)
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false })
    await new Promise((r) => setTimeout(r, 500))
  }
  if (process.argv[3] === 'reload') {
    await send('Page.reload', { ignoreCache: true })
    await new Promise((r) => setTimeout(r, 2600))
  }
  if (process.argv[4]) {
    const r = await send('Runtime.evaluate', { expression: process.argv[4], awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) console.log('eval 异常:', JSON.stringify(r.exceptionDetails).slice(0, 300))
    await new Promise((r2) => setTimeout(r2, 4200))
  }
  await new Promise((r) => setTimeout(r, 600))

  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'))

  const metrics = await send('Page.getLayoutMetrics')
  console.log('viewport:', metrics.cssVisualViewport && metrics.cssVisualViewport.clientWidth + 'x' + metrics.cssVisualViewport.clientHeight)

  const title = await send('Runtime.evaluate', { expression: 'document.title + " | " + document.querySelectorAll(".song-list tbody tr").length + " rows | " + (document.querySelector("#npName")||{}).textContent', returnByValue: true })
  console.log('page:', title.result && title.result.value)

  ws.close()
  console.log('saved', OUT, fs.statSync(OUT).size, 'bytes')
  process.exit(0)
}
main().catch((e) => { console.log('ERR', e.message); process.exit(1) })
