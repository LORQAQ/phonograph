'use strict'
/* 校验电脑端安装包内容（BUG-REPORT-2 B24 的桌面版） */
const fs = require('node:fs')
const path = require('node:path')
const { execSync } = require('node:child_process')

const ROOT = path.resolve(__dirname, '..', '..')
const EXE = path.join(ROOT, 'lx-music-clone', '留声-1.0.23-安装包.exe')
const TMP = path.join(ROOT, 'lx-music-clone', 'build', '_verify_exe')

if (!fs.existsSync(EXE)) { console.error('✗ 安装包不存在'); process.exit(1) }
console.log('校验对象: ' + EXE)
console.log('大小: ' + (fs.statSync(EXE).size / 1048576).toFixed(1) + ' MB\n')

/* 从 exe 里提取内嵌 zip */
const buf = fs.readFileSync(EXE)
const start = buf.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
if (start < 0) { console.error('✗ 找不到内嵌 zip'); process.exit(1) }
console.log('ZIP 偏移: ' + start)

fs.rmSync(TMP, { recursive: true, force: true })
fs.mkdirSync(TMP, { recursive: true })
const zipPath = path.join(TMP, '_payload.zip')
fs.writeFileSync(zipPath, buf.slice(start))

try {
  execSync('tar.exe -xf "' + zipPath + '" -C "' + TMP + '"', { stdio: 'pipe' })
} catch (e) {
  console.error('✗ 解包失败：' + e.message)
  process.exit(1)
}

function read (rel) {
  const p = path.join(TMP, rel)
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''
}

const srv = read('app/server.js')
const cp = read('app/lib/cross-platform.js')
const app = read('public/app.js')
const sm = read('app/lib/source-manager.js')
const qq = read('app/lib/qq.js')
const kg = read('app/lib/kugou.js')

const checks = [
  ['server.js 存在', srv.length > 20000],
  ['B6 /api/pic 限制 CDN', srv.includes('PIC_HOST_ALLOW')],
  ['B7 Origin 守卫', srv.includes('sameOrigin')],
  ['B7 写接口强制 POST', srv.includes('WRITE_PATHS')],
  ['B14 remove 无 dir 参数', !srv.includes("q.get('dir')") || !srv.includes("q.get('dir') || ''")],
  ['B15 reveal 路径校验', srv.includes('只能定位音频文件')],
  ['B18 in-flight 复用', srv.includes('urlInflight')],
  ['B39 intParam', srv.includes('function intParam')],
  ['B41 写盘合并', srv.includes('dbFirstDirtyAt') && srv.includes('flushDb')],
  ['B41 信号 flush', srv.includes('shutdownGracefully')],
  ['B42 loadAll 共享 promise', sm.includes('_loadingPromise')],
  ['B47 LRU', srv.includes('function cacheGet')],
  ['B51 Cookie 脱敏', srv.includes('function publicSettings') && srv.includes('qqCookieTail')],
  ['B4 名称相似度校验', cp.includes('similarName') && cp.includes('similarSinger')],
  ['B4 元数据缺失不兜底', cp.includes('_metaMissing')],
  ['B16 qq 失败不缓存', qq.includes('cache.delete(key)')],
  ['B16 kugou 失败不缓存', kg.includes('cache.delete(key)')],
  ['B17 总超时 12000', sm.includes('12000')],
  ['B1 导入地址取值', app.includes("const urlEl = $('#importUrl')")],
  ['B2 音质切换防 TDZ', app.includes('if (timer) { clearTimeout(timer)')],
  ['B2 音质切换 token', app.includes('token !== state.playToken')],
  ['B52 取流失败提示', app.includes('没取到播放地址')],
  ['B53 探测器回收', app.includes('__pcCleanup')],
  ['runtime node.exe', fs.existsSync(path.join(TMP, 'runtime', 'node.exe'))],
  ['ffmpeg', fs.existsSync(path.join(TMP, 'runtime', 'bin', 'ffmpeg.exe'))],
  ['sources 目录', fs.existsSync(path.join(TMP, 'sources')) && fs.readdirSync(path.join(TMP, 'sources')).filter((f) => f.endsWith('.js')).length >= 5],
]

let ok = 0
for (const [n, p] of checks) {
  console.log('  ' + (p ? '✓' : '✗') + ' ' + n)
  if (p) ok++
}
console.log('\n通过 ' + ok + '/' + checks.length)

fs.rmSync(TMP, { recursive: true, force: true })
if (ok !== checks.length) { process.exitCode = 1; console.error('\n有 ' + (checks.length - ok) + ' 项未通过') }
else console.log('\n全部通过')
