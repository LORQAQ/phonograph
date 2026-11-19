'use strict'
/* 验证「检查更新」实现 */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

let pass = 0, fail = 0
const failures = []
function ok (n, e) { pass++; console.log('  ✓ ' + n + (e ? '  ' + e : '')) }
function bad (n, d) { fail++; failures.push(n + (d ? ' — ' + d : '')); console.log('  ✗ ' + n + (d ? '  ' + d : '')) }

const s = fs.readFileSync('public/app.js', 'utf8')
const html = fs.readFileSync('public/index.html', 'utf8')
const cs = fs.readFileSync('scripts/NativeShell.cs', 'utf8')
const java = fs.readFileSync('../apk-build/app/src/com/phonograph/player/NapiBridge.java', 'utf8')

console.log('【1】前端实现')
const ver = (s.match(/const APP_VERSION = '([^']+)'/) || [])[1]
ver ? ok('APP_VERSION 常量 = ' + ver) : bad('APP_VERSION', '缺')
s.includes('async function checkUpdate') ? ok('checkUpdate 函数') : bad('checkUpdate', '缺')
s.includes('function openExternal') ? ok('openExternal 函数') : bad('openExternal', '缺')
s.includes('function cmpVersion') ? ok('cmpVersion 函数') : bad('cmpVersion', '缺')
s.includes("api.github.com/repos/' + GH_OWNER + '/' + GH_REPO + '/releases/latest") ? ok('GitHub API URL') : bad('GitHub API', '缺')
s.includes("$('#btnCheckUpdate')") ? ok('按钮绑定') : bad('按钮绑定', '缺')
s.includes('id="btnCheckUpdate"') ? ok('设置面板有按钮') : bad('设置面板按钮', '缺')

console.log('\n【2】cmpVersion 单测')
{
  const m = s.match(/function cmpVersion \(a, b\) \{[\s\S]*?\n\}/)
  if (!m) { bad('cmpVersion 抽取', '失败') } else {
    const fn = new Function('return ' + m[0])()
    const cases = [
      ['1.0.24', '1.0.24', 0],
      ['v1.0.25', '1.0.24', 1],
      ['1.0.9', '1.0.10', -1],
      ['1.1.0', '1.0.99', 1],
      ['2.0.0', '1.9.9', 1],
      ['1.0.24', '1.0.9', 1],
      ['', '1.0.24', -1],
    ]
    let badCnt = 0
    for (const [a, b, want] of cases) {
      const got = fn(a, b)
      if (got !== want) { badCnt++; console.log('    ✗ ' + a + ' vs ' + b + ' → ' + got + '（期望 ' + want + '）') }
    }
    badCnt === 0 ? ok('cmpVersion 7 个用例全对') : bad('cmpVersion', badCnt + ' 个错')
  }
}

console.log('\n【3】openExternal 三端分支')
{
  const m = s.match(/function openExternal \(url\) \{[\s\S]*?\n\}/)
  if (!m) { bad('openExternal 抽取', '失败') } else {
    const src = m[0]
    src.includes('NAPI.openUrl') ? ok('手机端走 NAPI.openUrl') : bad('手机端分支', '缺')
    src.includes("postMessage('openUrl:'") ? ok('桌面端走外壳 postMessage') : bad('桌面端分支', '缺')
    src.includes('window.open') ? ok('浏览器 fallback window.open') : bad('浏览器分支', '缺')
  }
}

console.log('\n【4】C# 外壳')
cs.includes('openUrl:') ? ok('NativeShell 处理 openUrl:') : bad('NativeShell', '缺 openUrl 分支')
cs.includes('UseShellExecute = true') ? ok('用 shell 打开') : bad('shell 打开', '缺')
cs.includes('!url.StartsWith("http://")') ? ok('只允许 http(s)') : bad('协议校验', '缺')

console.log('\n【5】Java 原生')
java.includes('public boolean openUrl(String url)') ? ok('NapiBridge.openUrl') : bad('NapiBridge.openUrl', '缺')
java.includes('Intent.ACTION_VIEW') ? ok('用 ACTION_VIEW') : bad('ACTION_VIEW', '缺')
java.includes('FLAG_ACTIVITY_NEW_TASK') ? ok('加 NEW_TASK 标志') : bad('NEW_TASK', '缺')
java.includes('web.getContext()') ? ok('用 web.getContext()') : bad('getContext', '缺')

console.log('\n【6】设置面板标签')
s.includes('检查更新（当前 v${APP_VERSION}）') ? ok('标签显示当前版本') : bad('标签', '缺')

console.log('\n=== 结果 ===')
console.log('通过 ' + pass + ' / 失败 ' + fail)
if (fail) {
  console.log('失败项:')
  failures.forEach((f) => console.log('  - ' + f))
  process.exitCode = 1
} else console.log('全部通过')
