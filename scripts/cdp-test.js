'use strict'
/* CDP 交互测试：切换歌单视图 / 播放 / 打开桌面歌词，分别截图 */
const fs = require('node:fs')
const PORT = 9333

async function targets () {
  const res = await fetch('http://127.0.0.1:' + PORT + '/json/list')
  return res.json()
}

function connect (url) {
  const ws = new WebSocket(url)
  let id = 0
  const pending = new Map()
  const events = []
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id); pending.delete(msg.id)
      msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result)
    } else if (msg.method) events.push(msg)
  })
  const ready = new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j) })
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id
    pending.set(mid, { resolve, reject })
    ws.send(JSON.stringify({ id: mid, method, params }))
  })
  return { ws, ready, send, events }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

;(async () => {
  const list = await targets()
  const main = list.find((t) => t.type === 'page' && /127\.0\.0\.1:37621\/$/.test(t.url)) || list.find((t) => t.type === 'page')
  const c = connect(main.webSocketDebuggerUrl)
  await c.ready
  await c.send('Page.enable')
  await c.send('Runtime.enable')

  const evalJs = async (expr, wait = 900) => {
    const r = await c.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) console.log('  ⚠ eval 异常:', JSON.stringify(r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text).slice(0, 300))
    await sleep(wait)
    return r
  }
  const shot = async (file) => {
    const s = await c.send('Page.captureScreenshot', { format: 'png' })
    fs.writeFileSync(file, Buffer.from(s.data, 'base64'))
    console.log('  saved', file, Math.round(fs.statSync(file).size / 1024) + 'KB')
  }

  // 1. 歌单视图
  console.log('1) 歌单视图')
  await evalJs("switchView('playlist')", 1200)
  await shot('shot-playlists.png')

  // 2. 播放第一首
  console.log('2) 播放中')
  await evalJs("(function(){ switchView('search'); playSong(state.results[0], state.results); return 'ok' })()", 3800)
  const st = await c.send('Runtime.evaluate', { expression: "JSON.stringify({name:(state.currentSong||{}).name, playing:state.playing, provider:document.querySelector('#srcBadge').textContent, dock:document.querySelector('#dockStatus').textContent})", returnByValue: true })
  console.log('  state:', st.result.value)
  await shot('shot-playing.png')

  // 3. 桌面歌词窗口
  console.log('3) 桌面歌词')
  await evalJs("openDesktopLyric()", 2500)
  const list2 = await targets()
  const lw = list2.find((t) => /lyric-window/.test(t.url))
  if (!lw) { console.log('  ⚠ 未找到歌词窗口 target:', list2.map((t) => t.type + ':' + t.url).join(' | ')) }
  else {
    const c2 = connect(lw.webSocketDebuggerUrl)
    await c2.ready
    await c2.send('Page.enable')
    await sleep(1200)
    const s = await c2.send('Page.captureScreenshot', { format: 'png' })
    fs.writeFileSync('shot-lyric-window.png', Buffer.from(s.data, 'base64'))
    console.log('  saved shot-lyric-window.png', Math.round(fs.statSync('shot-lyric-window.png').size / 1024) + 'KB')
    const t = await c2.send('Runtime.evaluate', { expression: "JSON.stringify({line:document.querySelector('#line').textContent, song:document.querySelector('#song').textContent, playing:document.body.classList.contains('playing')})", returnByValue: true })
    console.log('  lyric state:', t.result.value)
    c2.ws.close()
  }

  // 4. 切回暂停态，看唱臂
  console.log('4) 暂停态唱臂')
  await evalJs("(document.querySelector('#audio')).pause()", 900)
  await shot('shot-paused.png')

  c.ws.close()
  console.log('done')
  process.exit(0)
})().catch((e) => { console.log('ERR', e.message); process.exit(1) })
