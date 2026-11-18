'use strict'
/* 在 Node 里验证浏览器版 LX 运行时：能否加载音源脚本并拿到 inited */
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { request } = require(path.resolve(__dirname, '../app/lib/lx-engine.js'))

const WWW = path.resolve(__dirname, '../mobile/www')

// 伪造浏览器环境
const sandbox = {}
sandbox.window = sandbox
sandbox.globalThis = sandbox
sandbox.self = sandbox
sandbox.console = console
sandbox.setTimeout = setTimeout
sandbox.clearTimeout = clearTimeout
sandbox.setInterval = setInterval
sandbox.clearInterval = clearInterval
sandbox.btoa = (s) => Buffer.from(s, 'binary').toString('base64')
sandbox.atob = (s) => Buffer.from(s, 'base64').toString('binary')
sandbox.TextEncoder = TextEncoder
sandbox.TextDecoder = TextDecoder
sandbox.URLSearchParams = URLSearchParams
sandbox.URL = URL
sandbox.Uint8Array = Uint8Array
sandbox.performance = performance

// 同步 HTTP 桥：用 Atomics.wait 阻塞（Node 主线程可用）
const { execFileSync } = require('node:child_process')
sandbox.NAPI = {
  http (url, optsJson) {
    try {
      const opts = JSON.parse(optsJson || '{}')
      const args = ['-s', '-m', '20', '-X', (opts.method || 'GET').toUpperCase()]
      for (const [k, v] of Object.entries(opts.headers || {})) args.push('-H', k + ': ' + v)
      if (opts.body) args.push('--data-binary', opts.body)
      args.push(url)
      const out = execFileSync('curl.exe', args, { maxBuffer: 20 * 1024 * 1024, timeout: 25000 })
      return JSON.stringify({ status: 200, body: out.toString('utf8') })
    } catch (e) {
      return JSON.stringify({ error: e.message })
    }
  },
}

const ctx = vm.createContext(sandbox)

function load (file) {
  const code = fs.readFileSync(path.join(WWW, file), 'utf8')
  vm.runInContext(code, ctx, { filename: file })
}

load('lib/vendor/crypto-js.min.js')
load('lib/vendor/pako.min.js')
load('lib/vendor/jsencrypt.min.js')
load('lib/lx-engine-web.js')

console.log('CryptoJS:', typeof sandbox.CryptoJS, '| pako:', typeof sandbox.pako, '| JSEncrypt:', typeof sandbox.JSEncrypt)
console.log('LxScriptManager:', typeof sandbox.LxScriptManager)

const sources = JSON.parse(fs.readFileSync(path.join(WWW, 'sources-data.js'), 'utf8').replace(/^window\.LX_SOURCES=/, '').replace(/;\s*$/, ''))
console.log('打包脚本数:', sources.length)

;(async () => {
  for (const item of sources) {
    try {
      const s = new sandbox.LxScript(item.id, item.code)
      await s.init(12000)
      const srcs = Object.keys(s.sources || {})
      console.log('✅', item.id.padEnd(14), '「' + (s.meta.name || '').slice(0, 12) + '」 支持:', srcs.join(','))
    } catch (e) {
      console.log('❌', item.id.padEnd(14), e.message.slice(0, 60))
    }
  }
})()
