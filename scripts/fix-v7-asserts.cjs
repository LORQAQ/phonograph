'use strict'
/* 更新两个过时的断言：writable===false 现在是软警告；推荐歌单死弹窗已删 */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

let n = 0

/* ---------- 1. verify-round6：改成确认死弹窗已删 ---------- */
{
  const f = 'scripts/verify-round6.cjs'
  const lines = fs.readFileSync(f, 'utf8').split('\n')
  const i = lines.findIndex((l) => l.includes('btnRecImport 绑定'))
  if (i >= 0) {
    /* 往前找到注释行 */
    let start = i
    for (let k = i; k >= Math.max(0, i - 3); k--) {
      if (lines[k].includes('/* ============')) { start = k; break }
    }
    /* 往后找到下一个分节 */
    let end = lines.length
    for (let k = i; k < lines.length; k++) {
      if (lines[k].includes('/* ============') && k > i) { end = k; break }
    }
    const neu = [
      '/* ============ 2. 推荐歌单死弹窗已移除 ============ */',
      'console.log("\\n【2】推荐歌单死弹窗")',
      'const __html2 = fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8")',
      'const __deadGone = !__html2.includes("overlayRec") && !__html2.includes("btnRecImport")',
      '__deadGone ? ok("死弹窗已从 HTML 移除") : bad("推荐歌单死弹窗", "还在 HTML 里")',
      '',
    ]
    lines.splice(start, end - start, ...neu)
    fs.writeFileSync(f, lines.join('\n'), 'utf8')
    n++
    console.log('✓ round6 断言已更新')
  } else {
    console.log('⚠ round6 找不到 btnRecImport 断言')
  }
}

/* ---------- 2. verify-write-fix：writable 断言 ---------- */
{
  const f = 'scripts/verify-write-fix.cjs'
  const lines = fs.readFileSync(f, 'utf8').split('\n')
  let hit = 0
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (!l.includes('writable === false')) continue
    /* 替换整行为「软警告」检查 */
    const isMobile = l.includes('mApp')
    const v = isMobile ? 'mApp' : 'app'
    const label = isMobile ? '手机端' : '桌面端'
    lines[i] = '  ' + v + ".split('\\n').some((x) => x.includes('writable === false') && x.includes('toast'))"
      + " ? ok('" + label + " 写探测失败只警告')"
      + " : bad('" + label + " 缺少软警告')"
    hit++
  }
  if (hit) {
    fs.writeFileSync(f, lines.join('\n'), 'utf8')
    n++
    console.log('✓ write-fix 断言已更新 (' + hit + ' 处)')
  } else {
    console.log('⚠ write-fix 找不到 writable 断言')
  }
}

console.log('共更新 ' + n + ' 个文件')