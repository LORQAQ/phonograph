'use strict'
/* 验证桌面歌词窗口：播放 -> 打开歌词 -> 截图（含透明背景检查） */
const fs = require('node:fs')
const PORT = 9333
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function list () { return (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json() }

function conn (url) {
  const ws = new WebSocket(url)
  let id = 0
  const p = new Map()
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && p.has(m.id)) { const q = p.get(m.id); p.delete(m.id); m.error ? q.reject(new Error(m.error.message)) : q.resolve(m.result) }
  })
  const ready = new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j) })
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const i = ++id; p.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params }))
  })
  return { ws, ready, send }
}

;(async () => {
  const t0 = await list()
  const main = t0.find((t) => t.type === 'page' && /37621\/$/.test(t.url))
  if (!main) { console.log('主页面未找到:', t0.map((t) => t.url).join(' | ')); process.exit(1) }
  const c = conn(main.webSocketDebuggerUrl)
  await c.ready
  await c.send('Page.enable')
  await c.send('Runtime.evaluate', { expression: 'playSong(state.results[0], state.results)', awaitPromise: true })
  await sleep(3500)
  const mainShot = await c.send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('shot-main-final.png', Buffer.from(mainShot.data, 'base64'))
  console.log('saved shot-main-final.png', Math.round(fs.statSync('shot-main-final.png').size / 1024) + 'KB')
  await c.send('Runtime.evaluate', { expression: "window.chrome.webview.postMessage('desktopLyric')" })
  await sleep(3000)

  const t1 = await list()
  console.log('targets:', t1.map((t) => t.type + ':' + t.url).join(' | '))
  const lw = t1.find((t) => /lyric-window/.test(t.url))
  if (!lw) { console.log('歌词窗口未出现'); process.exit(1) }
  const c2 = conn(lw.webSocketDebuggerUrl)
  await c2.ready
  await c2.send('Page.enable')
  await sleep(1500)
  const s = await c2.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  fs.writeFileSync('shot-lyric-transparent.png', Buffer.from(s.data, 'base64'))
  const info = await c2.send('Runtime.evaluate', {
    expression: "JSON.stringify({line:document.querySelector('#line').textContent,next:document.querySelector('#next').textContent,song:document.querySelector('#song').textContent,playing:document.body.classList.contains('playing'),bg:getComputedStyle(document.body).backgroundColor,native:!!(window.chrome&&window.chrome.webview)})",
    returnByValue: true,
  })
  console.log('lyric:', info.result.value)
  console.log('saved shot-lyric-transparent.png', Math.round(fs.statSync('shot-lyric-transparent.png').size / 1024) + 'KB')
  c.ws.close(); c2.ws.close()
  process.exit(0)
})().catch((e) => { console.log('ERR', e.message); process.exit(1) })
