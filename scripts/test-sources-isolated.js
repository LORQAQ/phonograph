'use strict'
/* 逐个隔离测试音源脚本：每个单独进程 + 内存上限，识别 OOM / 超时 */
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const NODE = process.execPath
const DIRS = [
  'D:\\edge\\js',
  'D:\\edge\\js\\本地音源-11月更新（v7）',
  'D:\\edge\\js\\本地音源-9月更新（v6）',
]

const files = []
for (const d of DIRS) {
  if (!fs.existsSync(d)) continue
  for (const f of fs.readdirSync(d)) {
    if (f.toLowerCase().endsWith('.js')) files.push(path.join(d, f))
  }
}

console.log('待测脚本:', files.length, '个\n')

const runner = `
const fs=require('fs');
const path=require('path');
const {LxScript}=require(path.join(process.cwd(),'app','lib','lx-engine.js'));
(async()=>{
  const code=fs.readFileSync(process.argv[1],'utf8');
  const s=new LxScript(code, path.basename(process.argv[1]));
  await s.init(12000);
  console.log('RESULT_OK ' + Object.keys(s.sources).join('/'));
  process.exit(0);
})().catch(e=>{ console.log('RESULT_FAIL ' + String(e.message).slice(0,60)); process.exit(1); });
`

const out = []
for (const f of files) {
  const name = path.basename(f)
  const r = spawnSync(NODE, ['--max-old-space-size=512', '-e', runner, f], {
    cwd: process.cwd(),
    timeout: 25000,
    encoding: 'utf8',
    windowsHide: true,
  })
  let status = ''
  if (r.error && r.error.code === 'ETIMEDOUT') status = 'TIMEOUT'
  else if (r.signal || r.status === null) status = 'CRASH'
  else {
    const o = (r.stdout || '') + (r.stderr || '')
    if (/heap out of memory|Invalid string length|Allocation failed/i.test(o)) status = 'OOM'
    else {
      const m = /RESULT_OK ([^\r\n]*)/.exec(o)
      if (m) status = 'OK [' + (m[1] || '无平台') + ']'
      else {
        const f2 = /RESULT_FAIL ([^\r\n]*)/.exec(o)
        status = 'FAIL ' + (f2 ? f2[1] : '无输出')
      }
    }
  }
  out.push({ name, status })
  console.log(String(out.length).padStart(2) + '. ' + name.padEnd(42) + ' ' + status)
}

const okList = out.filter((x) => x.status.startsWith('OK'))
console.log('\n可用:', okList.length, '/', out.length)
okList.forEach((x) => console.log('  ' + x.name))
