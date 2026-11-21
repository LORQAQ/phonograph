'use strict'
/* 写方法修复的完整验证：源码 + 手机端 + 产物一致性 */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

let pass = 0, fail = 0
const failures = []
function ok (n, e) { pass++; console.log('  ✓ ' + n + (e ? '  ' + e : '')) }
function bad (n, d) { fail++; failures.push(n + (d ? ' — ' + d : '')); console.log('  ✗ ' + n + (d ? '  ' + d : '')) }

function read (p) { return fs.readFileSync(p, 'utf8') }

console.log('================ 写方法修复验证 ================\n')

/* ---------- 1. 前端 5 处必须是 POST ---------- */
console.log('【1】public/app.js 写操作必须 POST')
const app = read('public/app.js')

const CHECKS = [
  { name: '保存下载目录', re: /api\('\/api\/download-dir\?set=' \+ encodeURIComponent\(v\), \{ method: 'POST' \}\)/ },
  { name: '选择目录回填', re: /api\('\/api\/download-dir\?set=' \+ encodeURIComponent\(dir\), \{ method: 'POST' \}\)/ },
  { name: '删除已下载文件', re: /api\('\/api\/downloads\/remove\?name=' \+ encodeURIComponent\(name\), \{ method: 'POST' \}\)/ },
  { name: '打开下载文件夹', re: /api\('\/api\/downloads\/reveal\?name=' \+ encodeURIComponent\(name\) \+ '&dir=' \+ encodeURIComponent\(dir\), \{ method: 'POST' \}\)/ },
  { name: '音源测速', re: /api\('\/api\/sources\/test\?' \+ songParams\(song\)\.toString\(\), \{ method: 'POST' \}\)/ },
]
for (const c of CHECKS) {
  c.re.test(app) ? ok(c.name + ' → POST') : bad(c.name + ' 没用 POST')
}

/* ---------- 2. 读接口不能被误伤 ---------- */
console.log('\n【2】读接口保持 GET')
const READS = [
  ['读取下载目录', /api\('\/api\/download-dir'\)\.then/],
  ['读取设置', /api\('\/api\/settings'\)\.then/],
]
for (const [n, re] of READS) re.test(app) ? ok(n + ' → GET') : bad(n + ' 被改了')

/* ---------- 3. 误导性提示必须清干净 ---------- */
console.log('\n【3】误导性提示')
  app.split('\n').some((x) => x.includes('writable === false') && x.includes('toast')) ? ok('桌面端 写探测失败只警告') : bad('桌面端 缺少软警告')
app.includes('重启程序后一般正常') ? bad('还有「重启程序后一般正常」') : ok('无「重启就好」假话')

/* ---------- 4. 服务端 WRITE_PATHS ---------- */
console.log('\n【4】服务端 WRITE_PATHS')
const sv = read('app/server.js')
const ws = sv.indexOf('WRITE_PATHS = new Set([')
const block = sv.slice(ws, sv.indexOf('])', ws) + 2)
const MUST = ['/api/downloads/reveal', '/api/sources/test', '/api/downloads/remove', '/api/settings'.replace('/api/settings', '/api/shutdown')]
for (const w of ['/api/downloads/reveal', '/api/sources/test', '/api/downloads/remove']) {
  block.includes("'" + w + "'") ? ok(w + ' 在写名单') : bad(w + ' 不在写名单')
}
/* download-dir 绝不能整条进名单 */
block.includes('/api/download-dir') ? bad('/api/download-dir 不该在写名单（会让读取 405）') : ok('/api/download-dir 不在写名单（读取正常）')

/* ---------- 5. 服务端 mkdir 错误必须暴露 ---------- */
console.log('\n【5】服务端目录校验')
sv.includes('目录无法创建') ? ok('mkdir 失败会报错') : bad('mkdir 错误被吞')
sv.includes('目录不可写') ? ok('不可写会报错') : bad('不可写检查缺失')
const badSave = /try \{ fs\.mkdirSync\(dir, \{ recursive: true \}\) \} catch \(e\) \{ \}/.test(sv)
badSave ? bad('还有吞异常的空 catch') : ok('无空 catch 吞异常')

/* ---------- 6. 手机端一致 ---------- */
console.log('\n【6】手机端 mobile/www')
const mApp = read('mobile/www/app.js')
const mApi = read('mobile/www/api-mobile.js')

for (const c of CHECKS) {
  c.re.test(mApp) ? ok('手机端 ' + c.name + ' → POST') : bad('手机端 ' + c.name + ' 没跟上')
}
  mApp.split('\n').some((x) => x.includes('writable === false') && x.includes('toast')) ? ok('手机端 写探测失败只警告') : bad('手机端 缺少软警告')
mApp.includes('重启程序后一般正常') ? bad('手机端还有「重启就好」') : ok('手机端提示正确')

/* api-mobile 要能透传 method */
mApi.includes('opts.method') || mApi.includes('method:') ? ok('api-mobile 支持 method 透传') : bad('api-mobile 可能丢了 method')

/* ---------- 7. 版本号 ---------- */
console.log('\n【7】版本号')
const vApp = (app.match(/const APP_VERSION = '([^']+)'/) || [])[1]
const vM = (mApp.match(/const APP_VERSION = '([^']+)'/) || [])[1]
const vS = (sv.match(/version: '([^']+)', pid/) || [])[1]
const mf = read('../apk-build/app/AndroidManifest.xml')
const vName = (mf.match(/android:versionName="([^"]+)"/) || [])[1]
const vCode = (mf.match(/android:versionCode="(\d+)"/) || [])[1]

console.log('  桌面 app.js   ' + vApp)
console.log('  手机 app.js   ' + vM)
console.log('  server        ' + vS)
console.log('  versionName   ' + vName)
console.log('  versionCode   ' + vCode)
vApp === vM && vApp === vS && vApp === vName ? ok('版本号全一致 ' + vApp) : bad('版本号不一致')
Number(vCode) >= 17 ? ok('versionCode=' + vCode) : bad('versionCode 太小')

/* ---------- 8. 语法 ---------- */
console.log('\n【8】语法')
const { execFileSync } = require('node:child_process')
for (const f of ['public/app.js', 'app/server.js', 'mobile/www/app.js', 'mobile/www/api-mobile.js']) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' })
    ok(f)
  } catch (e) {
    bad(f + ' 语法错误', String(e.stderr || e.message).slice(0, 120))
  }
}

console.log('\n================ 汇总 ================')
console.log('通过 ' + pass + ' / 失败 ' + fail)
if (fail) { console.log('\n失败项:'); failures.forEach((f) => console.log('  - ' + f)); process.exitCode = 1 }
else console.log('全部通过')
