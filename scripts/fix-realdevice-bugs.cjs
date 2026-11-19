'use strict'
/* 真机测试发现的 2 个问题 */
const path = require('node:path')
process.chdir(path.resolve(__dirname, '..'))
const fs = require('node:fs')
const done = []
const miss = []

/* ============ 1. 手机端 __kgMapSong 还是 remark 覆盖歌名（P1-3 只改了电脑端） ============ */
{
  const p = 'mobile/www/api-mobile.js'
  let s = fs.readFileSync(p, 'utf8')
  const old = `  let songName = String(x.songname || '').trim()
  if (!songName && fileName.includes(' - ')) songName = fileName.split(' - ').slice(1).join(' - ').trim()
  if (!songName) songName = fileName
  if (remark && remark !== songName) songName = remark
  if (!songName) songName = '未知歌曲'`

  if (s.includes(old)) {
    s = s.replace(old, `  let songName = String(x.songname || '').trim()
  if (!songName && fileName.includes(' - ')) songName = fileName.split(' - ').slice(1).join(' - ').trim()
  if (!songName) songName = fileName
  if (!songName) songName = '未知歌曲'
  /* P1-3: remark 是任意备注（翻译名、《我是证人》电影主题曲……），
     覆盖会把真歌名弄丢，搜原名搜不到。原名保留，备注进 alias。 */
  const __alias = (remark && remark !== songName) ? remark : ''`)

    /* 返回值里带上 alias */
    const retOld = `    name: songName,
    singer: singer || '未知歌手',`
    if (s.includes(retOld)) {
      s = s.replace(retOld, `    name: songName,
    alias: __alias,
    singer: singer || '未知歌手',`)
      done.push('手机端 remark → alias')
    }
  } else {
    miss.push('手机端 __kgMapSong')
  }
  fs.writeFileSync(p, s, 'utf8')
}

/* ============ 2. 错误条要过滤音源脚本自己抛的错误 ============ */
{
  const p = 'public/app.js'
  let s = fs.readFileSync(p, 'utf8')
  const old = `window.addEventListener('unhandledrejection', (e) => {`
  if (s.includes(old) && !s.includes('__isSourceNoise')) {
    const idx = s.indexOf(old)
    const ls = s.lastIndexOf('\n', idx) + 1
    s = s.slice(0, ls) + `/* 音源脚本内部经常抛「failed」这类无意义错误（freelisten 就一直在抛），
   这些不是我们的 bug，不该显示在顶部红条里 */
function __isSourceNoise (e) {
  try {
    if (!e) return false
    const reason = e.reason || e
    const msg = String((reason && reason.message) || reason || '')
    const stack = String((reason && reason.stack) || '')
    const src = String((e.filename || '') + stack)
    /* 来源是 lx-source-*.js 的异常一律当噪音 */
    if (/lx-source-[\\w-]+\\.js/.test(src)) return true
    /* 只有 message 没有任何信息量的 */
    if (/^(failed|error|undefined|null|NetworkError|AbortError)$/i.test(msg.trim())) return true
    return false
  } catch (err) { return false }
}

${old.trim()}
  if (__isSourceNoise(e)) { try { console.warn('[音源噪音]', e.reason && e.reason.message) } catch (err) { } return }` + s.slice(ls + old.length)
    done.push('错误条过滤音源噪音')
  } else {
    if (s.includes('__isSourceNoise')) done.push('错误条过滤已存在')
    else miss.push('unhandledrejection')
  }
  fs.writeFileSync(p, s, 'utf8')
}

console.log('=== 已完成 ===')
done.forEach((d) => console.log('  ✓ ' + d))
if (miss.length) {
  console.log('=== 未匹配 ===')
  miss.forEach((m) => console.log('  ⚠ ' + m))
}
