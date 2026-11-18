'use strict'
/* 用 node 直接打 /api/playlist preview，排除 PowerShell 引号问题 */
const http = require('node:http')

function post (path, obj) {
  return new Promise((resolve) => {
    const b = JSON.stringify(obj)
    const u = new URL('http://127.0.0.1:37621' + path)
    const q = http.request({
      host: u.hostname, port: u.port, path: u.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b) },
      timeout: 90000,
    }, (res) => {
      let d = ''
      res.on('data', (c) => { d += c })
      res.on('end', () => resolve(d))
    })
    q.on('error', (e) => resolve('ERR:' + e.message))
    q.on('timeout', () => { q.destroy(); resolve('TIMEOUT') })
    q.write(b)
    q.end()
  })
}

;(async () => {
  const url = 'https://music.163.com/#/playlist?id=18428485896'
  const raw = await post('/api/playlist', { action: 'preview', url })
  console.log('原始返回长度: ' + raw.length)
  let j = null
  try { j = JSON.parse(raw) } catch (e) { console.log('解析失败'); }
  if (j) {
    console.log('字段: ' + Object.keys(j).join(', '))
    if (j.songs) {
      console.log('歌曲数: ' + j.songs.length)
      if (j.songs[0]) {
        console.log('第一首: ' + j.songs[0].name + ' / ' + j.songs[0].singer + ' / ' + (j.songs[0].durationText || '?'))
      }
    } else {
      console.log('返回内容: ' + raw.slice(0, 300))
    }
  }
})()
