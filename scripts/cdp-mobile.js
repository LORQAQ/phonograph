'use strict'
/* 移动端视口截图：node scripts/cdp-mobile.js out.png [w] [h] [reload] */
const fs = require('node:fs')
const http = require('node:http')
const PORT = 9333

function get (path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: PORT, path }, (res) => {
      let d = ''
      res.on('data', (c) => { d += c })
      res.on('end', () => resolve(JSON.parse(d)))
    }).on('error', reject)
  })
}

function wsConnect (url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const key = Buffer.from(String(Math.random())).toString('base64')
    const req = http.request({
      host: u.hostname, port: u.port, path: u.pathname + u.search,
      headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13' },
    })
    req.on('upgrade', (res, socket) => resolve(socket))
    req.on('error', reject)
    req.end()
  })
}

function makeSend (socket) {
  let id = 0
  const pending = new Map()
  let buf = Buffer.alloc(0)
  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk])
    while (buf.length >= 2) {
      const len0 = buf[1] & 0x7f
      let offset = 2
      let len = len0
      if (len0 === 126) { len = buf.readUInt16BE(2); offset = 4 }
      else if (len0 === 127) { len = Number(buf.readBigUInt64BE(2)); offset = 10 }
      if (buf.length < offset + len) break
      const payload = buf.slice(offset, offset + len).toString()
      buf = buf.slice(offset + len)
      try {
        const msg = JSON.parse(payload)
        if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) }
      } catch (e) {}
    }
  })
  return (method, params) => new Promise((resolve) => {
    const myId = ++id
    pending.set(myId, resolve)
    const s = JSON.stringify({ id: myId, method, params: params || {} })
    const payload = Buffer.from(s)
    const header = payload.length < 126
      ? Buffer.from([0x81, 0x80 | payload.length])
      : Buffer.from([0x81, 0x80 | 126, payload.length >> 8, payload.length & 255])
    const mask = Buffer.from([1, 2, 3, 4])
    const masked = Buffer.from(payload.map((b, i) => b ^ mask[i % 4]))
    socket.write(Buffer.concat([header, mask, masked]))
  })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

;(async () => {
  const out = process.argv[2] || 'shot-mobile.png'
  const w = Number(process.argv[3] || 390)
  const h = Number(process.argv[4] || 844)
  const reload = process.argv[5] === 'reload'

  const targets = await get('/json/list')
  const page = targets.find((t) => t.type === 'page' && /^http:\/\/127\.0\.0\.1:37621\/$/.test(t.url)) ||
    targets.find((t) => t.type === 'page' && !/lyric-window/.test(t.url))
  if (!page) { console.log('未找到页面'); process.exit(1) }

  const socket = await wsConnect(page.webSocketDebuggerUrl)
  const send = makeSend(socket)
  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: false })
  await sleep(400)
  if (reload) { await send('Page.reload', { ignoreCache: true }); await sleep(4200) }
  await sleep(800)

  if (process.argv[6]) {
    const pre = await send('Runtime.evaluate', { expression: process.argv[6], returnByValue: true })
    console.log('eval:', pre.result && pre.result.result && pre.result.result.value)
    await sleep(1200)
  }

  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'))

  const ev = await send('Runtime.evaluate', { expression: process.argv[6] || 'JSON.stringify({w:innerWidth,h:innerHeight,dpr:devicePixelRatio,tabs:getComputedStyle(document.querySelector(".mobile-tabs")).display,rail:getComputedStyle(document.querySelector(".rail")).display})', returnByValue: true })
  console.log('page:', page.title, '|', ev.result && ev.result.result && ev.result.result.value)
  console.log('saved', out)
  socket.destroy()
  process.exit(0)
})()
