'use strict'
/* 鍦ㄩ〉闈㈤噷鎵ц琛ㄨ揪寮忓苟鎵撳嵃缁撴灉锛歯ode scripts/cdp-eval.js "expr" */
const expr = process.argv[2]
;(async () => {
  const list = await (await fetch('http://127.0.0.1:9333/json/list')).json()
  const t = list.find((x) => x.type === 'page' && /127\.0\.0\.1:37621\/$/.test(x.url)) || list.find((x) => x.type === 'page')
  const ws = new WebSocket(t.webSocketDebuggerUrl)
  let id = 0
  const p = new Map()
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data)
    if (m.id && p.has(m.id)) { const q = p.get(m.id); p.delete(m.id); m.error ? q.reject(new Error(m.error.message)) : q.resolve(m.result) }
  })
  await new Promise((r) => ws.addEventListener('open', r))
  const send = (method, params = {}) => new Promise((res, rej) => {
    const i = ++id; p.set(i, { resolve: res, reject: rej }); ws.send(JSON.stringify({ id: i, method, params }))
  })
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, awaitPromise: true })
  if (r.exceptionDetails) console.log('EXCEPTION:', r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text)
  else console.log('RESULT:', typeof r.result.value === 'object' ? JSON.stringify(r.result.value) : r.result.value)
  ws.close()
  process.exit(0)
})().catch((e) => { console.log('ERR', e.message); process.exit(1) })
