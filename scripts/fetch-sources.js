'use strict'
/* 拉取最新音源脚本：pdone 主仓 + tfappstore 补充 */
const fs = require('node:fs')
const path = require('node:path')

const OUT = 'sources'
const MIRRORS = ['https://ghproxy.net/', 'https://gh-proxy.org/', 'https://ghfast.top/']

const P = 'https://raw.githubusercontent.com/pdone/lx-music-source/main/'
const T = 'https://raw.githubusercontent.com/tfappstore/lx-music-source/main/'

const targets = [
  ['sixyin', P + 'sixyin/latest.js'],
  ['huibq', P + 'huibq/latest.js'],
  ['flower', P + 'flower/latest.js'],
  ['lx', P + 'lx/latest.js'],
  ['ikun', P + 'ikun/latest.js'],
  ['grass', P + 'grass/latest.js'],
  ['fish', P + 'fish/latest.js'],
  ['changqing', P + 'changqing/latest.js'],
  ['feichangdao', P + 'feichangdao/latest.js'],
  ['kulao', T + 'kulao/latest.js'],
  ['nianxin', T + 'nianxin/latest.js'],
  ['quandouyao', T + 'quandouyao/latest.js'],
  ['yiyin', T + 'yiyin/latest.js'],
  ['lxv7', T + 'lx/latest.js'],
]

async function tryFetch (url) {
  for (const m of ['', ...MIRRORS]) {
    const u = m ? m + url : url
    try {
      const ctl = new AbortController()
      const timer = setTimeout(() => ctl.abort(), 25000)
      const res = await fetch(u, { signal: ctl.signal, headers: { 'User-Agent': 'Mozilla/5.0' } })
      clearTimeout(timer)
      if (!res.ok) continue
      const text = await res.text()
      if (text.length > 800 && /lx\.|EVENT_NAMES|globalThis/.test(text)) return { text, from: u }
    } catch (e) { }
  }
  return null
}

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const report = []
  for (const [name, url] of targets) {
    const r = await tryFetch(url)
    if (!r) {
      report.push(name + ': 下载失败')
      continue
    }
    const file = path.join(OUT, name + '.js')
    fs.writeFileSync(file, r.text, 'utf8')
    report.push(name + ': OK ' + Math.round(r.text.length / 1024) + 'KB')
  }
  console.log(report.join('\n'))
  console.log('\n现有脚本:', fs.readdirSync(OUT).filter((f) => f.endsWith('.js')).join(', '))
})()
