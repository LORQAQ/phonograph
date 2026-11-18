'use strict'
/* 用电脑端当前的 sources/*.js 重新生成手机端 sources-data.js（保证版本一致） */
const fs = require('node:fs')
const path = require('node:path')

const KEEP = ['dujia6', 'kxh', 'yuxi', 'changqing2', 'freelisten']
const SRC = 'sources'
const OUT = 'mobile/www/sources-data.js'

const list = []
for (const id of KEEP) {
  const f = path.join(SRC, id + '.js')
  if (!fs.existsSync(f)) {
    console.log('  缺失 ' + f)
    continue
  }
  const code = fs.readFileSync(f, 'utf8')
  list.push({ id, code })
  console.log('  ' + id.padEnd(12) + (code.length / 1024).toFixed(0) + ' KB')
}

if (!list.length) { console.log('没有可打包的音源'); process.exit(1) }

const out = 'window.LX_SOURCES=' + JSON.stringify(list) + ';\n'
fs.writeFileSync(OUT, out, 'utf8')
console.log('\n已生成 ' + OUT + '（' + list.length + ' 个音源，' + (out.length / 1024).toFixed(0) + ' KB）')

/* 校验 */
const vm = require('node:vm')
const check = vm.runInNewContext(out.slice(out.indexOf('['), out.lastIndexOf(']') + 1), {}, { timeout: 10000 })
console.log('校验: ' + check.length + ' 个 -> ' + check.map((x) => x.id).join(', '))
