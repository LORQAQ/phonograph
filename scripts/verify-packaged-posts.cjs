'use strict'
/* 验证安装包/APK 内的 app.js 是否含全部写方法修复（逐行判断，不用易错的正则） */
const path = require('node:path')
const fs = require('node:fs')
const { execSync } = require('node:child_process')
process.chdir(path.resolve(__dirname, '..'))

let pass = 0, fail = 0
const failures = []
function ok (n, e) { pass++; console.log('  ✓ ' + n + (e ? '  ' + e : '')) }
function bad (n, d) { fail++; failures.push(n + (d ? ' — ' + d : '')); console.log('  ✗ ' + n + (d ? '  ' + d : '')) }

/** 逐行检查：含 key 的那一行必须同时含 { method: 'POST' } */
function checkPost (lines, key, label) {
  const hit = lines.find((l) => l.includes(key))
  if (!hit) { bad(label, '找不到调用'); return }
  if (hit.includes("method: 'POST'")) ok(label)
  else bad(label, '同行业没有 method POST：' + hit.trim().slice(0, 90))
}

function audit (lines, tag) {
  checkPost(lines, '/api/download-dir?set=', tag + ' 保存下载目录')
  checkPost(lines, '/api/downloads/remove?name=', tag + ' 删除下载文件')
  checkPost(lines, '/api/downloads/reveal?name=', tag + ' 打开文件夹')
  checkPost(lines, '/api/sources/test?', tag + ' 音源测速')
  /* 选目录回填那条 */
  const picked = lines.find((l) => l.includes('/api/download-dir?set=') && l.includes('dir'))
  picked && picked.includes("method: 'POST'") ? ok(tag + ' 选目录回填') : bad(tag + ' 选目录回填')

  lines.some((l) => l.includes('writable === false')) ? bad(tag + ' 还有 writable===false') : ok(tag + ' 无死代码')
  lines.some((l) => l.includes('重启程序后一般正常')) ? bad(tag + ' 还有假话提示') : ok(tag + ' 提示正确')
}

/* ---------- 1. 安装包内的 app.js ---------- */
console.log('【1】留声-1.0.28-安装包.exe 内的 public/app.js')
{
  const exe = '留声-1.0.28-安装包.exe'
  if (!fs.existsSync(exe)) { bad('安装包不存在'); }
  else {
    const tmp = 'build/_chk_exe'
    fs.rmSync(tmp, { recursive: true, force: true })
    fs.mkdirSync(tmp, { recursive: true })
    try {
      const b = fs.readFileSync(exe)
      /* 找 PK 头 */
      const sig = Buffer.from([0x50, 0x4b, 0x03, 0x04])
      const idx = b.indexOf(sig)
      if (idx < 0) throw new Error('找不到 zip 头')
      fs.writeFileSync(tmp + '/p.zip', b.slice(idx))
      execSync('tar.exe -xf ' + tmp + '/p.zip -C ' + tmp, { stdio: 'pipe' })
      const p = tmp + '/public/app.js'
      if (!fs.existsSync(p)) throw new Error('解包后没有 public/app.js')
      const s = fs.readFileSync(p, 'utf8')
      const ver = (s.match(/const APP_VERSION = '([^']+)'/) || [])[1]
      ver === '1.0.28' ? ok('版本号 1.0.28') : bad('版本号', ver)
      audit(s.split('\n'), '安装包')
    } catch (e) {
      bad('解包安装包', e.message)
    }
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

/* ---------- 2. 归档的 APK ---------- */
console.log('\n【2】留声.apk 内的 assets/www/app.js')
{
  const apk = '留声.apk'
  if (!fs.existsSync(apk)) { bad('APK 不存在'); }
  else {
    const tmp = 'build/_chk_apk'
    fs.rmSync(tmp, { recursive: true, force: true })
    fs.mkdirSync(tmp, { recursive: true })
    try {
      execSync('tar.exe -xf ' + apk + ' -C ' + tmp, { stdio: 'pipe' })
      const p = tmp + '/assets/www/app.js'
      if (!fs.existsSync(p)) throw new Error('解包后没有 assets/www/app.js')
      const s = fs.readFileSync(p, 'utf8')
      const ver = (s.match(/const APP_VERSION = '([^']+)'/) || [])[1]
      ver === '1.0.28' ? ok('版本号 1.0.28') : bad('版本号', ver)
      audit(s.split('\n'), 'APK')

      /* 与源码逐字节比对 */
      const src = fs.readFileSync('mobile/www/app.js', 'utf8')
      s === src ? ok('与 mobile/www/app.js 逐字节一致') : bad('与源码不一致', s.length + ' vs ' + src.length)
    } catch (e) {
      bad('解包 APK', e.message)
    }
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

/* ---------- 3. 源码自身 ---------- */
console.log('\n【3】源码 public/app.js')
audit(fs.readFileSync('public/app.js', 'utf8').split('\n'), '源码')

console.log('\n================ 汇总 ================')
console.log('通过 ' + pass + ' / 失败 ' + fail)
if (fail) { console.log('\n失败:'); failures.forEach((f) => console.log('  - ' + f)); process.exitCode = 1 }
else console.log('全部通过')