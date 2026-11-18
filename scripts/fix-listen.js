'use strict'
const fs = require('node:fs')
const p = 'app/server.js'
let s = fs.readFileSync(p, 'utf8')

const start = s.indexOf("server.listen(PORT, '0.0.0.0'")
if (start < 0) { console.log('未找到 listen'); process.exit(1) }
const end = s.indexOf('})', start) + 2

const block = `server.listen(PORT, '0.0.0.0', () => {
  const os = require('node:os')
  const ips = []
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) ips.push(i.address)
  }
  global.__LAN_IPS = ips
  console.log('=========================================')
  console.log('  留声 已启动  http://127.0.0.1:' + PORT)
  console.log('  手机访问   ' + (ips[0] ? 'http://' + ips[0] + ':' + PORT : '(未检测到局域网地址)'))
  console.log('  数据目录   ' + DATA)
  console.log('=========================================')
})`

s = s.slice(0, start) + block + s.slice(end)
fs.writeFileSync(p, s, 'utf8')
console.log('listen 段已重写')
