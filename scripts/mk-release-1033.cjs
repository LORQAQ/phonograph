'use strict'
/* 把 release-v1032.cjs 改造成 v1.0.33 的发布脚本 */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

let s = fs.readFileSync('scripts/release-v1032.cjs', 'utf8')
s = s.split('1.0.32').join('1.0.33')
s = s.replace("name: '留声 ' + VER + '（回滚版）'", "name: '留声 ' + VER")

/* 换掉 release body */
const bodyLines = [
  '## 这一版修了两个真 bug',
  '',
  '### 1. 窄屏布局塌掉（手机版，宽度 ≤860px）',
  '',
  '截图里：670px 宽时右侧唱机/歌词面板不隐藏，和中间内容、底部标签栏挤在一起，中间一大片空白。',
  '',
  '根因是 `style.css` **末尾**有一段无条件的规则：',
  '',
  '```css',
  '.deck{ display:flex; flex-direction:column; min-height:0; overflow:hidden; }',
  '```',
  '',
  '它和 `@media (max-width:860px)` 里的 `.deck{display:none}` 特异性相同，但写在后面 —— 后出现者胜。',
  '所以窄屏下右侧面板永远显示。它的 `overflow:hidden` 还会盖掉窄屏全屏播放页需要的 `overflow-y:auto`，那一页不能滚动。',
  '',
  '改成只在 `@media (min-width:861px)` 里生效（基础规则第 304 行本来就有 `display:flex`）。',
  '',
  '顺带修掉同一区块里的嵌套注释 bug：',
  '',
  '```css',
  'body.m-deck /* 注释 */ body.m-deck .deck-tabs{...}',
  '```',
  '',
  '注释被当成顺序分隔符，两条选择器被拼成后代选择器，永远命中不了。',
  '',
  '### 2. 设置里填 `D:\\音乐` 被拒',
  '',
  '写探测被做成了硬拦截。实测本机：PowerShell 能写这个目录，Node 的 open 却报 EPERM，',
  '而真实下载走的是另一条代码路径 —— 拿探测结果阻止保存，会把正常目录挡在外面。',
  '',
  '改成只有 mkdir 失败、或同名文件占位才返回 400。',
  '',
  '### 真机验证（1.0.33 / versionCode 22）',
  '',
  '| 场景 | 结果 |',
  '|---|---|',
  '| 1080x1920 原生分辨率 | ✓ 文字清晰、布局正常 |',
  '| 强制 670x1197 窄屏 | ✓ 单列 + 底部标签栏，右侧面板隐藏 |',
  '| 播放 | ✓ 正常，进度前进 |',
  '| 歌词面板 | ✓ 正常显示并跟随高亮 |',
  '| 下载目录 `D:\\音乐` | ✓ 200 `writable:true` |',
  '',
  '### 关于上一版',
  '',
  '1.0.31 那轮大范围重构引入了回归（手机端歌词全空、UI 乱），已整体回滚到 1.0.30 基线。',
  '这一版只保留上面两个修复，其余一律不动。',
].join('\n').split(String.fromCharCode(96)).join(String.fromCharCode(92) + String.fromCharCode(96))

const start = s.indexOf('const BODY = `')
const end = s.indexOf('`\n\n;', start)
if (start > 0 && end > start) {
  s = s.slice(0, start) + 'const BODY = `' + bodyLines + s.slice(end)
  console.log('✓ release body 已替换')
} else {
  console.log('⚠ 找不到 BODY 块')
}

fs.writeFileSync('scripts/release-v1033.cjs', s, 'utf8')
console.log('✓ scripts/release-v1033.cjs 已生成')