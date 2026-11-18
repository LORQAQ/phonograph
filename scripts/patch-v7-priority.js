'use strict'
/* 把 2026-11 月更新的音源（v7 系列）排到最前 */
const fs = require('node:fs')

const V7 = ['kxh', 'yuxi', 'changqing2', 'hyw', 'dujia7', 'dujia6']

/* ---------- 1) 电脑端 source-manager ---------- */
const sp = 'app/lib/source-manager.js'
let s = fs.readFileSync(sp, 'utf8')

const kgLine = "    const KG_ORDER = ['fish', 'kulao', 'quandouyao', 'yiyin', 'lxv7', 'lx', 'huibq', 'nianxin', 'changqing', 'feichangdao', 'grass', 'flower', 'ikun', 'sixyin', 'juhe']"
const kgNew = "    const KG_ORDER = [" + V7.map((x) => "'" + x + "'").join(', ') + ", 'fish', 'kulao', 'quandouyao', 'yiyin', 'lxv7', 'lx', 'huibq', 'nianxin', 'changqing', 'nianxin2', 'changqing2', 'freelisten', 'xxm', 'xingkong', 'juheapi', 'yunduan', 'yehua', 'qita', 'dujia4', 'feichangdao', 'grass', 'flower', 'ikun', 'sixyin', 'juhe', 'dl6', 'yecao']"

if (s.includes(kgLine)) {
  s = s.replace(kgLine, kgNew)
} else {
  /* 兼容带初始权重的版本 */
  s = s.replace(/const KG_ORDER = \[[^\]]*\]/, "const KG_ORDER = [" + V7.map((x) => "'" + x + "'").join(', ') + ", 'fish', 'kulao', 'quandouyao', 'yiyin', 'lxv7', 'lx', 'huibq', 'nianxin', 'changqing', 'nianxin2', 'changqing2', 'freelisten', 'xxm', 'xingkong', 'juheapi', 'yunduan', 'yehua', 'qita', 'dujia4', 'feichangdao', 'grass', 'flower', 'ikun', 'sixyin', 'juhe']")
}
fs.writeFileSync(sp, s, 'utf8')
console.log('电脑端 KG_ORDER 已更新:', s.includes("'kxh', 'yuxi'"))

/* ---------- 2) 手机端 lx-engine-web ---------- */
const mp = 'mobile/www/lib/lx-engine-web.js'
let m = fs.readFileSync(mp, 'utf8')
const prioNew = "const PRIO = [" + V7.map((x) => "'" + x + "'").join(', ') + ", 'fish', 'nianxin', 'kulao', 'quandouyao', 'yiyin', 'lxv7', 'lx', 'huibq', 'ikun', 'flower', 'grass', 'changqing', 'juhe', 'sixyin']"
if (m.includes('const PRIO = [')) {
  m = m.replace(/const PRIO = \[[^\]]*\]/, prioNew)
}
if (m.includes('const PRIO_KG = [')) {
  m = m.replace(/const PRIO_KG = \[[^\]]*\]/, "const PRIO_KG = [" + V7.map((x) => "'" + x + "'").join(', ') + ", 'fish', 'kulao', 'quandouyao', 'yiyin', 'lxv7', 'lx', 'huibq', 'nianxin', 'changqing']")
}
fs.writeFileSync(mp, m, 'utf8')
console.log('手机端 PRIO 已更新:', m.includes("'kxh', 'yuxi'"))
