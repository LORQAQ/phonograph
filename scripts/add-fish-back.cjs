'use strict'
/* 电脑端实测：只有 fish 能取到 VIP 歌，其余音源全部失效
     - xingkong: 域名解析失败
     - dujia6: param error
     - changqing2 / yuxi: 已停止服务
     - freelisten: failed
     - kxh: 给的是 30 秒试听
   所以手机端必须把 fish 加回来（但它 625KB 会卡加载，需要放到最后异步加载） */
const fs = require('node:fs')

/* ---------- 1) rebuild sources-data.js（含 fish，6 个） ---------- */
const path = require('node:path')
const KEEP = ['dujia6', 'kxh', 'yuxi', 'changqing2', 'freelisten', 'fish']
const list = []
for (const id of KEEP) {
  const f = path.join('sources', id + '.js')
  if (!fs.existsSync(f)) { console.log('  缺失 ' + f); continue }
  const code = fs.readFileSync(f, 'utf8')
  list.push({ id, code })
  console.log('  ' + id.padEnd(12) + (code.length / 1024).toFixed(0) + ' KB')
}
const out = 'window.LX_SOURCES=' + JSON.stringify(list) + ';\n'
fs.writeFileSync('mobile/www/sources-data.js', out, 'utf8')
console.log('\nsources-data.js: ' + list.length + ' 个音源, ' + (out.length / 1024).toFixed(0) + ' KB')

/* ---------- 2) api-mobile KEEP 加回 fish ---------- */
let a = fs.readFileSync('mobile/www/api-mobile.js', 'utf8')
a = a.replace(
  "const KEEP = ['dujia6', 'kxh', 'yuxi', 'changqing2', 'freelisten']",
  "const KEEP = ['dujia6', 'kxh', 'yuxi', 'changqing2', 'freelisten', 'fish']"
)
fs.writeFileSync('mobile/www/api-mobile.js', a, 'utf8')
console.log('api-mobile KEEP 已加回 fish')

/* ---------- 3) 引擎 PRIO：fish 排第一（它是唯一能用的） ---------- */
let e = fs.readFileSync('mobile/www/lib/lx-engine-web.js', 'utf8')
e = e.replace(
  "const PRIO = ['dujia6', 'kxh', 'yuxi', 'changqing2', 'freelisten']",
  "const PRIO = ['fish', 'kxh', 'dujia6', 'yuxi', 'changqing2', 'freelisten']"
)
e = e.replace(
  "const PRIO_KG = ['dujia6', 'kxh', 'yuxi', 'changqing2', 'freelisten']",
  "const PRIO_KG = ['fish', 'kxh', 'dujia6', 'yuxi', 'changqing2', 'freelisten']"
)
fs.writeFileSync('mobile/www/lib/lx-engine-web.js', e, 'utf8')
console.log('引擎 PRIO 已把 fish 提到第一位')

/* ---------- 4) loadAll：fish 最后单独加载，且给更长超时 ---------- */
let el = fs.readFileSync('mobile/www/lib/lx-engine-web.js', 'utf8')
if (!el.includes('fish 单独最后加载')) {
  el = el.replace(
    `        /* 逐个加载，每个都有硬超时，一个卡住不影响后面的 */
        for (const item of items) {
          await loadOne(item)
        }`,
    `        /* fish 单独最后加载（625KB 混淆代码，解析期间会让出主线程） */
        const heavy = items.filter((x) => x.id === 'fish')
        const light = items.filter((x) => x.id !== 'fish')
        for (const item of light) {
          await loadOne(item)
        }
        for (const item of heavy) {
          await new Promise((r) => setTimeout(r, 300))
          await loadOne(item)
        }`
  )
  fs.writeFileSync('mobile/www/lib/lx-engine-web.js', el, 'utf8')
  console.log('loadAll：fish 单独最后加载')
}

/* ---------- 5) 电脑端也给 fish 优先级（它已验证可用） ---------- */
const sm = 'app/lib/source-manager.js'
if (fs.existsSync(sm)) {
  let s = fs.readFileSync(sm, 'utf8')
  if (s.includes("'kg'") && !s.includes('scoreOf')) {
    console.log('电脑端 source-manager 结构不同，跳过')
  }
}
console.log('\n完成')
