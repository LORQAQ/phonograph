'use strict'
/* 打印两端的音源优先级 */
const fs = require('node:fs')

console.log('='.repeat(60))
console.log('电脑端 app/lib/source-manager.js')
console.log('='.repeat(60))
const sm = fs.readFileSync('app/lib/source-manager.js', 'utf8')

/* 找候选顺序 / 优先级定义 */
sm.split('\n').forEach((l, i) => {
  if (/ORDER|candidates|scoreOf|KG_ORDER|sort|priority|PRIO/i.test(l)) {
    console.log('L' + (i + 1) + ': ' + l.trim().slice(0, 130))
  }
})

console.log('\n--- scoreOf 实现 ---')
const si = sm.indexOf('scoreOf')
if (si > 0) console.log(sm.slice(Math.max(0, si - 200), si + 500))

console.log('\n' + '='.repeat(60))
console.log('手机端 lib/lx-engine-web.js')
console.log('='.repeat(60))
const eng = fs.readFileSync('mobile/www/lib/lx-engine-web.js', 'utf8')

eng.split('\n').forEach((l, i) => {
  if (/PRIO|fish 优先|先单独试|并行竞速/.test(l)) {
    console.log('L' + (i + 1) + ': ' + l.trim().slice(0, 130))
  }
})

console.log('\n--- resolve 实际流程 ---')
const ri = eng.indexOf('async resolve (platform')
if (ri > 0) {
  const seg = eng.slice(ri, ri + 2600)
  /* 只打印关键行 */
  seg.split('\n').forEach((l) => {
    const t = l.trim()
    if (/fishScript|PRIO|const list|tasks|return \{|warn|probeUrl\(fu\)|order/.test(t)) {
      console.log('  ' + t.slice(0, 120))
    }
  })
}

console.log('\n' + '='.repeat(60))
console.log('手机端加载顺序（api-mobile.js KEEP）')
console.log('='.repeat(60))
const api = fs.readFileSync('mobile/www/api-mobile.js', 'utf8')
const ki = api.indexOf('const KEEP')
if (ki > 0) console.log(api.slice(ki, ki + 200))

console.log('\n' + '='.repeat(60))
console.log('手机端内置音源（sources-data.js）')
console.log('='.repeat(60))
const sd = fs.readFileSync('mobile/www/sources-data.js', 'utf8')
const ids = [...sd.matchAll(/"id":"([^"]+)"/g)].map((m) => m[1])
ids.forEach((id, i) => {
  const m = sd.match(new RegExp('"id":"' + id + '","code":"([\\s\\S]{0,400})'))
  const ver = m && m[1].match(/@version\s+([^\s*]+)/)
  console.log('  ' + (i + 1) + '. ' + id.padEnd(14) + (ver ? ver[1] : ''))
})

console.log('\n' + '='.repeat(60))
console.log('电脑端音源文件')
console.log('='.repeat(60))
const files = fs.readdirSync('sources').filter((f) => f.endsWith('.js'))
files.forEach((f, i) => {
  const sz = (fs.statSync('sources/' + f).size / 1024).toFixed(0)
  console.log('  ' + (i + 1) + '. ' + f.replace('.js', '').padEnd(14) + sz + ' KB')
})
