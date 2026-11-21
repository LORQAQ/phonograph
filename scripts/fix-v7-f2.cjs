'use strict'
/**
 * 修复 lx-engine-web 的全局还原：在 init 的每条出口（成功/失败/超时）都还原
 */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

const f = 'mobile/www/lib/lx-engine-web.js'
const lines = fs.readFileSync(f, 'utf8').split('\n')

/* 找到 init 方法，提取 prevLx / __prevBuffer 声明位置 */
const initIdx = lines.findIndex((l) => l.includes('init (timeout) {'))
if (initIdx < 0) { console.log('✗ 找不到 init'); process.exit(1) }

/* 1. 把 prevLx / prevBufferSnapshot 提前到 Promise 顶部，供所有出口使用 */
const declIdx = lines.findIndex((l) => l.includes('const prevLx = globalThis.lx'))
if (declIdx < 0) { console.log('✗ 找不到 prevLx'); process.exit(1) }

/* 在 `let settled = false` 后面插入还原函数 */
const settledIdx = lines.findIndex((l, i) => i > initIdx && l.includes('let settled = false'))
if (settledIdx < 0) { console.log('✗ 找不到 settled'); process.exit(1) }

lines.splice(settledIdx + 1, 0,
  "        /* P2: 全局还原必须覆盖所有出口（成功/失败/超时）。",
  "           原来只有一个 100ms 定时器，而脚本是异步 inited，那时 settled 仍为 false → 永不还原。 */",
  '        const prevLx0 = globalThis.lx',
  '        const prevBuf0 = globalThis.Buffer',
  '        const restoreGlobals = () => {',
  '          try { if (globalThis.lx === lx0 || globalThis.lx) globalThis.lx = prevLx0 } catch (e) { }',
  '          try { globalThis.Buffer = prevBuf0 } catch (e) { }',
  '        }',
  '        let lx0 = null')

/* 2. lx 对象定义后赋值 lx0 */
const lxObjIdx = lines.findIndex((l, i) => i > settledIdx && l.includes('const lx = {'))
if (lxObjIdx >= 0) {
  /* 找该对象结束 */
  let d = 0
  let j = lxObjIdx
  for (; j < lines.length; j++) {
    for (const ch of lines[j]) { if (ch === '{') d++; else if (ch === '}') d-- }
    if (j > lxObjIdx && d === 0) break
  }
  lines.splice(j + 1, 0, '        lx0 = lx')
}

/* 3. 三个出口都调用 restoreGlobals */
const patches = [
  ["              settled = true\n              clearTimeout(timer)\n              if (!data || !data.sources)",
    "              settled = true\n              clearTimeout(timer)\n              if (!data || !data.sources) { restoreGlobals(); reject(new Error('inited 缺少 sources')) } if (false) {}\n              if (!data || !data.sources)"],
]
/* 上面太绕，改成直接定位三处 reject/resolve 前插入 */
const outIdx = []
lines.forEach((l, i) => {
  if (i > initIdx && i < initIdx + 90) {
    if (/^\s*reject\(new Error\('inited 缺少 sources'\)\)/.test(l)) outIdx.push(i)
    if (/^\s*resolve\(data\)/.test(l)) outIdx.push(i)
    if (/^\s*reject\(new Error\('脚本初始化超时'\)\)/.test(l)) outIdx.push(i)
    if (/^\s*reject\(new Error\(this\.error\)\)/.test(l)) outIdx.push(i)
  }
})
/* 从后往前插，避免索引偏移 */
for (const i of outIdx.sort((a, b) => b - a)) {
  lines.splice(i, 0, '              restoreGlobals()')
}

fs.writeFileSync(f, lines.join('\n'), 'utf8')
console.log('✓ 全局还原已加到 ' + outIdx.length + ' 个出口')