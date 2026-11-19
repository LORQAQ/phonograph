// audit5-comment.cjs — 按 CSS 规范（注释不可嵌套、首个 星号+斜杠 即闭合）重写“去注释”后的选择器文本，
// 证明哪些规则会被浏览器丢弃。只做字符串处理。
'use strict';
const fs = require('fs');
const path = require('path');
const CSS = path.join(__dirname, '..', 'public', 'style.css');
const src = fs.readFileSync(CSS, 'utf8');

// 规范行为：遇到 斜杠星号 后一直吃到第一个 星号斜杠
function specStrip(s) {
  let out = '', i = 0;
  while (i < s.length) {
    if (s[i] === '/' && s[i + 1] === '*') {
      const end = s.indexOf('*/', i + 2);
      if (end < 0) { out += s.slice(i).replace(/[^\n]/g, ' '); break; }
      out += s.slice(i, end + 2).replace(/[^\n]/g, ' ');   // 保留换行，行号不漂移
      i = end + 2;
      continue;
    }
    out += s[i]; i++;
  }
  return out;
}
const clean = specStrip(src);
const lineAt = (idx) => (idx === 0 ? 1 : src.slice(0, idx).split('\n').length);

function show(fromLine, toLine, tag) {
  const lines = clean.split('\n');
  console.log('---- ' + tag + ' ----（规范去注释后，' + fromLine + '~' + toLine + ' 行）');
  for (let n = fromLine; n <= toLine; n++) {
    const t = lines[n - 1];
    if (t === undefined) continue;
    if (t.trim()) console.log(String(n).padStart(5) + '| ' + t.replace(/\s+/g, ' ').trim());
  }
  console.log('');
}

show(1290, 1306, 'A. L1290 的嵌套注释');

{
  const idx = clean.indexOf('绝对不要在 .vinyl-zone 的子元素上');
  const brace = clean.indexOf('{', idx);
  const prelude = clean.slice(idx, brace).replace(/\s+/g, ' ').trim();
  console.log('被合并进“选择器”的脏文本（L' + lineAt(idx) + ' → L' + lineAt(brace) + ' 的 { ）:');
  console.log('  ' + prelude.slice(0, 500) + (prelude.length > 500 ? ' …' : ''));
  console.log('结论：这条 prelude 不是合法选择器 → 整条规则（含 will-change / backface-visibility / transform-origin）被丢弃。');
  console.log('      紧随其后的 .vinyl.playing{animation:...} 有独立的 { }，不受影响。');
  console.log('');
}

show(648, 652, 'B. L650 行尾注释后面的规则');
{
  const idx = clean.indexOf('body.m-deck .deck-tabs');
  const before = clean.lastIndexOf('}', idx);
  console.log('去注释后的实际选择器文本：');
  console.log('  "' + clean.slice(before + 1, idx + 26).replace(/\s+/g, ' ').trim() + '{ … }"');
  console.log('结论：拼接成 body.m-deck body.m-deck .deck-tabs（body 不能嵌套 body）→ 规则永不命中。');
  console.log('');
}

const strayClose = [];
let q = null;
for (let i = 0; i < clean.length; i++) {
  const c = clean[i];
  if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
  if (c === '"' || c === "'") { q = c; continue; }
  if (c === '*' && clean[i + 1] === '/') strayClose.push('L' + lineAt(i));
}
console.log('非注释文本里落单的 星号斜杠：' + (strayClose.length ? strayClose.join(', ') : '无'));
