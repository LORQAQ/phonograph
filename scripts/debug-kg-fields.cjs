'use strict'
/* 调试 song_v2 返回的字段结构 */
const path = require('node:path')
process.chdir(path.resolve(__dirname, '..'))
const mod = require(path.join(process.cwd(), 'app', 'lib', 'kugou-gcid.js'))
const https = require('node:https')

async function raw () {
  const gcid = 'gcid_3znx57dpz2tz0b7'
  const { globalId } = await mod.decodeGcid(gcid)
  console.log('globalId: ' + globalId)

  const ct = String(Date.now())
  const params = 'appid=1058&global_specialid=' + encodeURIComponent(globalId) +
    '&specialid=0&plat=0&version=8000&page=1&pagesize=3' +
    '&srcappid=2919&clientver=20000&clienttime=' + ct + '&mid=' + ct + '&uuid=' + ct + '&dfid=-'
  const url = 'https://mobiles.kugou.com/api/v5/special/song_v2?' + params +
    '&signature=' + mod.signatureParams(params, 'web')

  const body = await new Promise((resolve, reject) => {
    const u = new URL(url)
    https.get({
      hostname: u.hostname, path: u.pathname + u.search,
      headers: { mid: ct, clienttime: ct, dfid: '-', Referer: 'https://m3ws.kugou.com/share/index.php', 'User-Agent': 'Mozilla/5.0' },
      timeout: 20000, rejectUnauthorized: false,
    }, (res) => {
      let d = ''
      res.on('data', (c) => { d += c })
      res.on('end', () => resolve(d))
    }).on('error', reject)
  })

  let j = null
  try { j = JSON.parse(body) } catch (e) {
    console.log('非 JSON: ' + body.slice(0, 200)); return
  }
  const list = (j.data && j.data.info) || []
  console.log('返回 ' + list.length + ' 首\n')

  if (list[0]) {
    console.log('=== 第一首的全部字段 ===')
    Object.keys(list[0]).sort().forEach((k) => {
      const v = list[0][k]
      const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
      console.log('  ' + k.padEnd(24) + ' = ' + s.slice(0, 90))
    })
  }
}

raw().catch((e) => console.log('ERR: ' + e.message))
