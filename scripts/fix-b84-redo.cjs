'use strict'
/* 撤销 B84 的错误插入，在正确位置重插 */
const path = require('node:path')
process.chdir(path.resolve(process.cwd(), '..'))
const fs = require('node:fs')
const p = 'apk-build/app/src/com/phonograph/player/NapiBridge.java'
let s = fs.readFileSync(p, 'utf8')

/* 1) 删除错误插入的那段 */
const bad = `        /* B84: fileName 为 null 时后面的 fileName.toLowerCase() 会 NPE，被 catch 吞掉 →
           文件被存成字面量 null 且扩展名修正失效 */
        if (fileName == null || fileName.trim().isEmpty()) {
            fileName = "audio_" + System.currentTimeMillis() + ".mp3";
        }
`
if (s.includes(bad)) {
  s = s.replace(bad, '')
  console.log('✓ 已删除错误插入')
} else {
  console.log('⚠ 没找到错误插入，尝试宽松匹配')
  s = s.replace(/\s*\/\* B84:[\s\S]{0,200}?fileName = "audio_" \+ System\.currentTimeMillis\(\) \+ "\.mp3";\s*\}\s*/m, '\n')
}

/* 2) 找 doDownload 的真实定义 */
const defMatch = s.match(/(\w[\w\s<>\[\]]*)\s+doDownload\s*\(\s*([^)]*)\)\s*(throws[^{]*)?\{/)
if (!defMatch) {
  console.log('⚠ 找不到 doDownload 定义')
  process.exit(1)
}

const sigStart = s.indexOf(defMatch[0])
const braceIdx = sigStart + defMatch[0].length - 1
console.log('doDownload 定义: ' + defMatch[0].replace(/\s+/g, ' ').slice(0, 120))
console.log('参数: ' + defMatch[2].trim())

/* 3) 在方法体开头插入保护（用局部变量，不改参数） */
const inject = `
        /* B84: fileName 为 null 时后面的 fileName.toLowerCase() 会 NPE，被 catch 吞掉。
           参数是 final，所以用局部变量覆盖。 */
        if (fileName == null || fileName.trim().isEmpty()) {
            fileName = "audio_" + System.currentTimeMillis() + ".mp3";
        }
`
/* 先看参数里是不是 final */
const isFinal = /final\s+String\s+fileName/.test(defMatch[2])
if (isFinal) {
  console.log('参数是 final，需要去掉 final 或改局部变量')
  /* 去掉 final 最简单 */
  const newSig = defMatch[0].replace(/final\s+String\s+fileName/g, 'String fileName')
  s = s.slice(0, sigStart) + newSig + s.slice(sigStart + defMatch[0].length)
  /* 重新定位 */
  const newSigStart = s.indexOf(newSig)
  const newBrace = newSigStart + newSig.length - 1
  s = s.slice(0, newBrace + 1) + inject + s.slice(newBrace + 1)
  console.log('✓ 去掉 final 并插入保护')
} else {
  s = s.slice(0, braceIdx + 1) + inject + s.slice(braceIdx + 1)
  console.log('✓ 插入保护')
}

fs.writeFileSync(p, s, 'utf8')
