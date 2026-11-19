'use strict'
/* Audit: isPrivateHost 逐字复制自 server.js:194-214，验证各种写法 */
const net = require('node:net')
function isPrivateHost (h) {
  if (!h) return true
  let host = String(h).toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  if (/^::ffff:(\d+\.\d+\.\d+\.\d+)$/.test(host)) host = host.replace(/^::ffff:/, '')
  if (/^0x[0-9a-f]+$/i.test(host)) { try { host = String(parseInt(host, 16)) } catch (e) { } }
  if (/^\d+$/.test(host)) { try { host = '0.0.0.' + host } catch (e) { } }
  if (typeof net.isIPv4 === 'function' && net.isIPv4(host)) {
    const [a, b] = host.split('.').map(Number)
    return a === 10 || a === 127 || a === 0 ||
           (a === 169 && b === 254) ||
           (a === 172 && b >= 16 && b <= 31) ||
           (a === 192 && b === 168) ||
           (a === 100 && b >= 64 && b <= 127)
  }
  if (typeof net.isIPv6 === 'function' && net.isIPv6(host)) {
    return host === '::1' || /^f[cd]/i.test(host) || /^fe80/i.test(host)
  }
  return /^(localhost|.*\.local|.*\.internal)$/i.test(host)
}

const cases = ['127.0.0.1', '127.1', '0x7f.0.0.1', '0x7f000001', '0x7f', '2130706433', '0177.0.0.1',
  '::1', '[::1]', '::ffff:127.0.0.1', 'localhost', 'a.local', '169.254.169.254', '10.1.2.3',
  'example.com', '127.0.0.1.nip.io', '1.1.1.1', '0', '192.168.1.1']
for (const c of cases) console.log(String(c).padEnd(22), '=> private?', isPrivateHost(c))
