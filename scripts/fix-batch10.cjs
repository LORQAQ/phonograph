'use strict'
/* 第 10 批收尾：B86 死代码 / B90 show() 返回 boolean */
process.chdir(require('node:path').resolve(__dirname, '..'))
const fs = require('node:fs')
const done = []
const miss = []

/* ---------- B86: renderList 未定义 ---------- */
{
  const p = 'public/app.js'
  let s = fs.readFileSync(p, 'utf8')
  const old = `  try { renderList && renderList() } catch (e) { }`
  if (s.includes(old)) {
    s = s.replace(old, `  /* B86: renderList 全文件不存在，这里换成真实入口 */
  try { if (state.view === 'downloads') renderDownloadsView() } catch (e) { }`)
    done.push('B86 renderList → renderDownloadsView')
  } else {
    const i = s.indexOf('renderList')
    if (i > 0) console.log('  B86 现场:\n' + s.slice(i - 200, i + 200))
    else done.push('B86 renderList 已不存在')
  }

  /* 删掉确认无引用的死函数 prevAudioQuality */
  if (s.includes('function prevAudioQuality')) {
    const idx = s.indexOf('function prevAudioQuality')
    const bs = s.indexOf('{', idx)
    let d = 0, e = bs
    for (let k = bs; k < s.length; k++) {
      if (s[k] === '{') d++
      else if (s[k] === '}') { d--; if (d === 0) { e = k + 1; break } }
    }
    /* 确认除了定义处没有别的引用 */
    const others = (s.match(/prevAudioQuality/g) || []).length
    if (others <= 1) {
      s = s.slice(0, idx) + s.slice(e)
      done.push('B86 删除死函数 prevAudioQuality')
    } else {
      console.log('  prevAudioQuality 还有 ' + others + ' 处引用，保留')
    }
  }

  fs.writeFileSync(p, s, 'utf8')
}

/* ---------- B90: LyricWindow.show() 返回 boolean ---------- */
{
  const p = '../apk-build/app/src/com/phonograph/player/LyricWindow.java'
  let s = fs.readFileSync(p, 'utf8')

  /* 找 show 方法签名 */
  const m = s.match(/(\w+\s+)?show\s*\(\s*String\s+\w+\s*,\s*String\s+\w+\s*\)\s*\{/)
  if (m && !/boolean\s+show/.test(s)) {
    s = s.replace(m[0], m[0].replace(/show\s*\(/, 'boolean show (').replace(/^(\s*)/, '$1'))
    /* 在方法体开头加权限检查 */
    const showIdx = s.indexOf('boolean show (')
    const brace = s.indexOf('{', showIdx)
    s = s.slice(0, brace + 1) + `
        /* B90: 没有悬浮窗权限时直接返回 false，让 JS 能感知并去申请 */
        if (!canShow(ctx)) return false;` + s.slice(brace + 1)
    /* 把方法体里的 return; 改成 return true;（只在 show 内）*/
    const endIdx = s.indexOf('\n    }', brace)
    if (endIdx > 0) {
      let body = s.slice(brace, endIdx)
      body = body.replace(/\n\s*return;\s*\n/g, '\n        return root != null;\n')
      s = s.slice(0, brace) + body + s.slice(endIdx)
    }
    fs.writeFileSync(p, s, 'utf8')
    done.push('B90 show() 返回 boolean + 权限检查')
  } else {
    const i = s.indexOf('show (')
    if (i > 0) console.log('  B90 show 现场:\n' + s.slice(i - 80, i + 200))
    else miss.push('B90 show')
  }
}

console.log('=== 已完成 ===')
done.forEach((d) => console.log('  ✓ ' + d))
if (miss.length) {
  console.log('=== 未匹配 ===')
  miss.forEach((m) => console.log('  ⚠ ' + m))
}
