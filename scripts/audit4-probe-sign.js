'use strict'
/* 审计用：区分「签名错」与「真限流」，并验证 sign 的排序语义 */
const crypto = require('node:crypto')
const https = require('node:https')

const WEB_KEY = 'NVPh5oo715z5DIWAeQlhMDsWXXQV4hwt'
const AND_KEY = 'OIlwieks28dk2k092lksi2UIkp'
const md5 = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex')

function req (url, { method = 'GET', body } = {}) {
  return new Promise((resolve) => {
    const u = new URL(url)
    const data = body ? Buffer.from(body) : null
    const r = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method,
      headers: Object.assign({
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/83 Mobile Safari/537.36',
        Accept: 'application/json, text/plain, */*',
      }, data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {}, { Referer: 'https://m.kugou.com/' }),
      timeout: 15000,
      rejectUnauthorized: false,
    }, (res) => {
      let d = ''
      res.on('data', (c) => { d += c })
      res.on('end', () => resolve({ status: res.statusCode, body: d }))
    })
    r.on('error', (e) => resolve({ status: 0, body: 'ERR ' + e.message }))
    r.on('timeout', () => { r.destroy(); resolve({ status: 0, body: 'TIMEOUT' }) })
    if (data) r.write(data)
    r.end()
  })
}

const GCID = process.argv[2] || 'gcid_3znx57dpz2tz0b7'

async function batchDecode (label, { params, body, sign: signOverride, sortSeg = true }) {
  const segs = String(params).split('&')
  const sorted = sortSeg ? segs.slice().sort() : segs
  const sign = signOverride || md5(AND_KEY + sorted.join('') + body + AND_KEY)
  const url = 'https://t.kugou.com/v1/songlist/batch_decode?' + params + '&signature=' + sign
  const t = Date.now()
  const r = await req(url, { method: 'POST', body })
  console.log('\n### ' + label + '  (' + (Date.now() - t) + 'ms, http ' + r.status + ')')
  console.log('  sig=' + sign)
  console.log('  body=' + r.body.slice(0, 300))
  return r.body
}

;(async () => {
  const bodyOk = JSON.stringify({ ret_info: 1, data: [{ id: GCID, id_type: 2 }] })
  const ct = String(Date.now())
  const paramsFresh = 'dfid=-&appid=1005&mid=' + ct + '&clientver=20109&clienttime=' + ct + '&uuid=-'
  const paramsHard = 'dfid=-&appid=1005&mid=0&clientver=20109&clienttime=640612895&uuid=-'

  await batchDecode('A 正版签名 + 硬编码 mid=0/clienttime=640612895', { params: paramsHard, body: bodyOk })
  await batchDecode('B 正版签名 + 新鲜 clienttime/mid', { params: paramsFresh, body: bodyOk })
  await batchDecode('C 故意错误签名（判断限流 vs 签名错）', { params: paramsHard, body: bodyOk, sign: 'deadbeef'.repeat(4) })
  await batchDecode('D 不排序 params（验证排序是否影响）', { params: paramsFresh, body: bodyOk, sortSeg: false })
  await batchDecode('E body 带空格（验证 body 拼接严格性）', { params: paramsFresh, body: JSON.stringify({ ret_info: 1, data: [{ id: GCID, id_type: 2 }] }, null, 2) })
})()
