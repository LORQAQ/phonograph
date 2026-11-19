'use strict'
/* 验证第六轮 5 项改动 */
const path = require('node:path')
const fs = require('node:fs')
const { execSync } = require('node:child_process')
process.chdir(path.resolve(__dirname, '..'))

let pass = 0, fail = 0
const failures = []
function ok (n, e) { pass++; console.log('  ✓ ' + n + (e ? '  ' + e : '')) }
function bad (n, d) { fail++; failures.push(n + (d ? ' — ' + d : '')); console.log('  ✗ ' + n + (d ? '  ' + d : '')) }

/* ============ 1. isPrivateHost 单测 ============ */
console.log('【1】isPrivateHost（从源码抽出实测）')
{
  const s = fs.readFileSync('app/server.js', 'utf8')
  const i = s.indexOf('function isPrivateHost')
  const bs = s.indexOf('{', i)
  let d = 0, e = bs
  for (let k = bs; k < s.length; k++) {
    if (s[k] === '{') d++
    else if (s[k] === '}') { d--; if (d === 0) { e = k + 1; break } }
  }
  const fnSrc = s.slice(i, e)
  const net = require('node:net')
  let fn
  try {
    fn = new Function('net', 'return ' + fnSrc)(net)
  } catch (err) {
    bad('isPrivateHost 抽取', err.message)
  }

  if (fn) {
    const cases = [
      ['127.0.0.1', true], ['localhost', true], ['::1', true], ['[::1]', true],
      ['127.1', true], ['0x7f.0.0.1', true], ['0x7f000001', true],
      ['2130706433', true], ['0177.0.0.1', true], ['::ffff:127.0.0.1', true],
      ['169.254.169.254', true], ['10.0.0.1', true], ['192.168.1.1', true],
      ['172.16.0.1', true], ['a.local', true], ['localhost.', true],
      ['8.8.8.8', false], ['example.com', false], ['1.1.1.1', false],
    ]
    let badCnt = 0
    for (const [input, want] of cases) {
      const got = fn(input)
      if (got !== want) { badCnt++; console.log('    ✗ ' + input + ' → ' + got + '（期望 ' + want + '）') }
    }
    badCnt === 0 ? ok('isPrivateHost 19 个用例全对') : bad('isPrivateHost', badCnt + ' 个用例错')
  }
}

/* ============ 2. btnRecImport 绑定 ============ */
console.log('\n【2】#btnRecImport 绑定')
{
  const s = fs.readFileSync('public/app.js', 'utf8')
  const hasSel = s.includes("$('#btnRecImport')")
  const hasBind = s.includes('__ri.onclick')
  ;(hasSel && hasBind) ? ok('已有 onclick 绑定') : bad('#btnRecImport', 'sel=' + hasSel + ' bind=' + hasBind)
  /* 确认 pendingRec 和 importFromCard 都存在 */
  const hasPending = s.includes('pendingRec')
  const hasImport = s.includes('function importFromCard') || s.includes('importFromCard =')
  hasPending ? ok('pendingRec 存在') : bad('pendingRec', '未定义')
  hasImport ? ok('importFromCard 存在') : bad('importFromCard', '未定义')
}

/* ============ 3. renderDownloadsView 复位 state.view ============ */
console.log('\n【3】renderDownloadsView 复位 state.view')
{
  const s = fs.readFileSync('public/app.js', 'utf8')
  const i = s.indexOf('async function renderDownloadsView')
  const body = s.slice(i, i + 400)
  body.includes("state.view = 'downloads'") ? ok('已复位 state.view') : bad('state.view', '没复位')
  body.includes('.rail-item') ? ok('已同步侧栏高亮') : bad('侧栏高亮', '没同步')
}

/* ============ 4. LocalProxy reason ============ */
console.log('\n【4】LocalProxy.reason 补 431/429')
{
  const s = fs.readFileSync('../apk-build/app/src/com/phonograph/player/LocalProxy.java', 'utf8')
  s.includes('case 431:') ? ok('431 已补') : bad('431', '没有')
  s.includes('case 429:') ? ok('429 已补') : bad('429', '没有')
  s.includes('case 408:') ? ok('408 已补') : bad('408', '没有')
}

/* ============ 5. discover 两端一致 ============ */
console.log('\n【5】discover newSongs 两端一致')
{
  const m = fs.readFileSync('mobile/www/api-mobile.js', 'utf8')
  const d = fs.readFileSync('app/server.js', 'utf8')
  /* 手机端 tx/kg 分支应该返回空数组 */
  const mTx = m.match(/if \(source === 'tx'\) \{[\s\S]{0,300}?\}/)
  const mKg = m.match(/if \(source === 'kg'\) \{[\s\S]{0,300}?\}/)
  const mOk = m.includes('__newSongs') && m.includes("if (plat !== 'wy') return []")
  mOk ? ok('手机端非 wy 分支返回 []') : bad('手机端 newSongs', '逻辑不对')

  /* 桌面端确认也是 [] */
  const dIdx = d.indexOf("/api/discover'")
  const dSeg = d.slice(dIdx, dIdx + 900)
  const dCnt = (dSeg.match(/newSongs: \[\]/g) || []).length
  dCnt >= 2 ? ok('桌面端 newSongs: [] （' + dCnt + ' 处）') : bad('桌面端 newSongs', '只有 ' + dCnt + ' 处 []')
}

/* ============ 6. 全量回归 ============ */
console.log('\n【6】服务端全量回归')
try {
  const out = execSync('"' + path.join(process.cwd(), 'runtime', 'node.exe') + '" scripts/regress-all.cjs', { encoding: 'utf8', timeout: 300000 })
  const m = out.match(/通过 (\d+) \/ 失败 (\d+)/)
  if (m) {
    Number(m[2]) === 0 ? ok('regress-all ' + m[1] + '/' + m[1]) : bad('regress-all', m[1] + ' 通过 / ' + m[2] + ' 失败')
    if (Number(m[2]) > 0) {
      const fails = out.match(/- [^\n]+/g) || []
      fails.slice(0, 5).forEach((f) => console.log('    ' + f))
    }
  } else {
    bad('regress-all', '输出格式不对')
  }
} catch (e) {
  const out = String(e.stdout || '') + String(e.stderr || '')
  const m = out.match(/通过 (\d+) \/ 失败 (\d+)/)
  if (m) {
    bad('regress-all', m[1] + ' 通过 / ' + m[2] + ' 失败')
    const fails = out.match(/- [^\n]+/g) || []
    fails.slice(0, 6).forEach((f) => console.log('    ' + f))
  } else {
    bad('regress-all', (e.message || '').slice(0, 120))
  }
}

/* ============ 7. Java 编译 ============ */
console.log('\n【7】Java 编译')
try {
  const jdkDir = fs.readdirSync('../apk-build/tools/jdk')[0]
  const javac = path.join('..', 'apk-build', 'tools', 'jdk', jdkDir, 'bin', 'javac.exe')
  const aj = path.join('..', 'apk-build', 'tools', 'plat', 'android-13', 'android.jar')
  const srcDir = path.join('..', 'apk-build', 'app', 'src')
  const srcs = []
  ;(function walk (dir) {
    for (const e2 of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e2.name)
      if (e2.isDirectory()) walk(p)
      else if (e2.name.endsWith('.java')) srcs.push('"' + p + '"')
    }
  })(srcDir)
  const tmp = path.join('..', 'apk-build', 'build', '_r6')
  fs.rmSync(tmp, { recursive: true, force: true })
  fs.mkdirSync(tmp, { recursive: true })
  execSync('"' + javac + '" -encoding UTF-8 -source 8 -target 8 -nowarn -bootclasspath "' + aj + '" -d "' + tmp + '" ' + srcs.join(' '), { stdio: 'pipe' })
  ok('javac 通过')
  fs.rmSync(tmp, { recursive: true, force: true })
} catch (e) {
  bad('javac', String(e.stderr || e.message).slice(0, 200))
}

console.log('\n=== 结果 ===')
console.log('通过 ' + pass + ' / 失败 ' + fail)
if (fail) {
  console.log('失败项:')
  failures.forEach((f) => console.log('  - ' + f))
  process.exitCode = 1
} else console.log('全部通过')
