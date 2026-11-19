'use strict'
/* 调试：看 request() 拿到的酷狗歌单页内容 */
const path = require('node:path')
process.chdir(path.resolve(__dirname, '..'))
const ROOT = process.cwd()

const { request } = require(path.join(ROOT, 'app', 'lib', 'lx-engine.js'))
const api = require(path.join(ROOT, 'app', 'lib', 'kugou.js'))

const gid = 'gcid_3znx57dpz2tz0b7'
const url = 'https://m.kugou.com/songlist/' + gid + '/'

;(async () => {
  console.log('请求: ' + url)
  const body = await new Promise((resolve, reject) => {
    request(url, { headers: api.HEADERS, insecure: true, timeout: 25000 },
      (e, r) => e ? reject(e) : resolve(r))
  })

  const html = String(body.body || body || '')
  console.log('length: ' + html.length)
  console.log('statusCode: ' + (body.statusCode || '?'))
  console.log('content-type: ' + (body.headers && body.headers['content-type']))

  console.log('\n是否含 "songs":[', html.includes('"songs":['))
  console.log('是否含 listinfo:', html.includes('listinfo'))
  console.log('是否含 gcid:', html.includes('gcid_'))
  console.log('是否含 html 标签:', html.includes('<html'))

  console.log('\n前 400 字:')
  console.log(html.slice(0, 400))
})()
