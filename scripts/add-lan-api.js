'use strict'
const fs = require('node:fs')
const p = 'app/server.js'
let s = fs.readFileSync(p, 'utf8')

const anchor = "  async '/api/health' () {"
if (!s.includes(anchor)) { console.log('未找到 health 路由'); process.exit(1) }
s = s.replace(anchor, `  async '/api/lan' () {
    const ips = global.__LAN_IPS || []
    return {
      port: PORT,
      ips,
      url: ips.length ? 'http://' + ips[0] + ':' + PORT : 'http://127.0.0.1:' + PORT,
      urls: ips.map((ip) => 'http://' + ip + ':' + PORT),
    }
  },

  async '/api/health' () {`)

fs.writeFileSync(p, s, 'utf8')
console.log('/api/lan 已加入')
