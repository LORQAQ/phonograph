'use strict'
/* 修两个断言：#1 外壳版本串在 .NET 里是 UTF-16；#2 下载目录软警告已随回滚去掉 */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

/* ---------- 1. build-shell.cjs ---------- */
{
  const f = 'scripts/build-shell.cjs'
  const lines = fs.readFileSync(f, 'utf8').split('\n')
  let hit = 0
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes("const NEED = [")) continue
    lines[i] = "  /* .NET 程序集里的字符串按 UTF-16LE 存，用 latin1 读出来每个字符间夹一个 \\0 */\n" +
      "  const NEED = ['Phonograph', 'a\\u0000p\\u0000i\\u0000/\\u0000h\\u0000e\\u0000a\\u0000l\\u0000t\\u0000h', '留声']"
    hit++
  }
  if (hit) {
    fs.writeFileSync(f, lines.join('\n'), 'utf8')
    console.log('✓ build-shell 断言已改')
  } else console.log('⚠ build-shell 未匹配')
}

/* ---------- 2. verify-packaged-posts.cjs ---------- */
{
  const f = 'scripts/verify-packaged-posts.cjs'
  const lines = fs.readFileSync(f, 'utf8').split('\n')
  let hit = 0
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes('缺少软警告')) continue
    /* 替换整条判断为「下载目录保存走 POST」 */
    lines[i] = "  lines.some((l) => l.includes('download-dir?set=') && l.includes(\"method: 'POST'\"))"
      + " ? ok(tag + ' 下载目录保存走 POST') : bad(tag + ' 下载目录保存链路缺失')"
    /* 清掉紧邻的 writable 判断行 */
    if (i > 0 && lines[i - 1].includes('writable === false')) lines[i - 1] = ''
    hit++
  }
  if (hit) {
    fs.writeFileSync(f, lines.join('\n'), 'utf8')
    console.log('✓ verify-packaged-posts 改了 ' + hit + ' 处')
  } else console.log('⚠ verify-packaged-posts 未匹配')
}