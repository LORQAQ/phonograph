'use strict'
/* 分析酷狗 songlist HTML，找歌曲数据 */
const https = require('node:https')

function get (url, headers) {
  return new Promise((resolve) => {
    const u = new URL(url)
    const q = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: Object.assign({
        'User-Agent': 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36',
        Referer: 'https://m.kugou.com/',
      }, headers || {}),
      timeout: 20000,
      rejectUnauthorized: false,
    }, (res) => {
      let d = ''
      res.on('data', (c) => { d += c })
      res.on('end', () => resolve({ status: res.statusCode, body: d }))
    })
    q.on('error', (e) => resolve({ status: 0, error: e.message }))
    q.end()
  })
}

;(async () => {
  const gcid = '3znx57dpz2tz0b7'
  const r = await get('https://m.kugou.com/songlist/gcid_' + gcid + '/')
  const html = r.body
  console.log('HTML 长度: ' + html.length)

  /* 找 title */
  const tm = /<title>([^<]{2,120})<\/title>/i.exec(html)
  console.log('标题: ' + (tm ? tm[1] : '无'))

  /* 找内嵌 JSON */
  const patterns = [
    ['window.__INITIAL_STATE__', /__INITIAL_STATE__\s*=\s*(\{[\s\S]{20,200000}?\});?\s*<\/script>/],
    ['window.__NUXT__', /__NUXT__\s*=\s*(\{[\s\S]{20,200000}?\});?\s*<\/script>/],
    ['var data =', /var\s+data\s*=\s*(\{[\s\S]{20,200000}?\});/],
    ['songlistData', /songlistData\s*[:=]\s*(\[[\s\S]{20,200000}?\]);/],
    ['"info":', /"info"\s*:\s*(\[[\s\S]{20,200000}?\])/],
    ['"audios":', /"audios"\s*:\s*(\[[\s\S]{20,200000}?\])/],
    ['"songlist":', /"songlist"\s*:\s*(\[[\s\S]{20,200000}?\])/],
    ['"list":', /"list"\s*:\s*(\[[\s\S]{20,200000}?\])/],
  ]
  for (const [name, re] of patterns) {
    const m = re.exec(html)
    if (m) {
      console.log('\n✓ 找到 ' + name + '，长度 ' + m[1].length)
      console.log('  前 300 字: ' + m[1].slice(0, 300).replace(/\s+/g, ' '))
    }
  }

  /* 找 hash（32位hex） */
  const hashes = [...html.matchAll(/"hash"\s*:\s*"([A-F0-9]{32})"/gi)]
  console.log('\n找到 hash 数量: ' + hashes.length)
  if (hashes.length) console.log('前 3 个: ' + hashes.slice(0, 3).map((x) => x[1]).join(', '))

  /* 找 songname */
  const names = [...html.matchAll(/"songname"\s*:\s*"([^"]{1,60})"/g)]
  console.log('找到 songname 数量: ' + names.length)
  if (names.length) console.log('前 3 个: ' + names.slice(0, 3).map((x) => x[1]).join(' | '))

  /* 找 filename */
  const fns = [...html.matchAll(/"filename"\s*:\s*"([^"]{1,80})"/g)]
  console.log('找到 filename 数量: ' + fns.length)
  if (fns.length) console.log('前 3 个: ' + fns.slice(0, 3).map((x) => x[1]).join(' | '))

  /* 找 script src */
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)]
  console.log('\n脚本: ' + scripts.slice(0, 5).map((x) => x[1]).join(', '))

  /* 保存一份用于人工看 */
  require('node:fs').writeFileSync('build/_kg_songlist.html', html)
  console.log('\n已保存 build/_kg_songlist.html')
})()
