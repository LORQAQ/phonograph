#!/usr/bin/env node
/* audit5-css.cjs — 纯字符串解析 CSS，无第三方依赖
 * 1) { } 配平（含注释/字符串感知、嵌套注释检测）
 * 2) 同选择器 + 同属性重复（后者覆盖前者）
 * 3) min()/max()/clamp() 参数语法
 * 4) .vinyl-zone 级联求值 + 各视口像素尺寸推算
 */
'use strict';
const fs = require('fs');
const path = require('path');

const CSS = process.argv[2] || path.join(__dirname, '../public/style.css');
const src = fs.readFileSync(CSS, 'utf8');
const L = src.split(/\r?\n/);
const lineAt = (i) => { let n = 1; for (let k = 0; k < i; k++) if (src.charCodeAt(k) === 10) n++; return n; };

/* ---------- 0. 注释扫描（记录注释区间 + 嵌套注释） ---------- */
function scanComments(s) {
  const spans = [], nested = [];
  let i = 0, quote = null;
  while (i < s.length) {
    const c = s[i];
    if (quote) { if (c === '\\') i += 2; else { if (c === quote) quote = null; i++; } continue; }
    if (c === '"' || c === "'") { quote = c; i++; continue; }
    if (c === '/' && s[i + 1] === '*') {
      const start = i; i += 2;
      while (i < s.length && !(s[i] === '*' && s[i + 1] === '/')) {
        if (s[i] === '/' && s[i + 1] === '*') nested.push({ at: i, line: lineAt(i) });
        i++;
      }
      if (i >= s.length) { spans.push({ start, end: s.length, unterminated: true }); break; }
      i += 2; spans.push({ start, end: i });
      continue;
    }
    i++;
  }
  return { spans, nested };
}
const { spans: comments, nested: nestedComments } = scanComments(src);

const inComment = (idx) => comments.some((c) => idx > c.start && idx < c.end);

/* ---------- 1. 花括号配平 ---------- */
function braceBalance(s) {
  const bad = []; let depth = 0, quote = null;
  const nocom = new Array(s.length).fill(true);
  for (const c of comments) for (let k = c.start; k < c.end; k++) nocom[k] = false;
  for (let i = 0; i < s.length; i++) {
    if (!nocom[i]) continue;
    const c = s[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth < 0) bad.push({ line: lineAt(i), msg: '多余的 }' }); }
  }
  if (depth > 0) bad.push({ line: L.length, msg: '未闭合的 { 共 ' + depth + ' 个' });
  return bad;
}

/* ---------- 解析成规则树 ---------- */
function stripComments(s, from, to) {
  // 把注释区替换为等长空格，保留偏移
  const out = s.slice(from, to).split('');
  for (const c of comments) {
    const a = Math.max(c.start, from), b = Math.min(c.end, to);
    for (let k = a; k < b; k++) if (k - from >= 0 && k - from < out.length) out[k - from] = ' ';
  }
  return out.join('');
}

const rules = [];   // {selector, media[], decls[], line, order}
const atBlocks = []; // {at, media[], line}
let order = 0;

function parseBlock(from, to, media, atName) {
  let i = from;
  while (i < to) {
    // 跳过空白与注释
    while (i < to) {
      const ch = src[i];
      if (/\s/.test(ch)) { i++; continue; }
      if (ch === '/' && src[i + 1] === '*') {
        const c = comments.find((x) => x.start === i);
        i = c ? c.end : i + 2; continue;
      }
      break;
    }
    if (i >= to) break;
    if (src[i] === '}') { i++; continue; }
    // 读 prelude 直到 { 或 ;
    let j = i, depthParen = 0;
    while (j < to) {
      const c = src[j];
      if (c === '/' && src[j + 1] === '*') { const cc = comments.find((x) => x.start === j); j = cc ? cc.end : j + 2; continue; }
      if (c === '(') depthParen++;
      else if (c === ')') depthParen--;
      else if (depthParen <= 0 && (c === '{' || c === ';')) break;
      j++;
    }
    const rawPrelude = stripComments(src, i, j).replace(/\s+/g, ' ').trim();
    if (j >= to) break;
    if (src[j] === ';') { i = j + 1; continue; }  // @import 之类
    // 找匹配的 }
    let k = j + 1, depth = 1, quote = null;
    while (k < to && depth > 0) {
      const c = src[k];
      if (c === '/' && src[k + 1] === '*') { const cc = comments.find((x) => x.start === k); k = cc ? cc.end : k + 2; continue; }
      if (quote) { if (c === '\\') k++; else if (c === quote) quote = null; k++; continue; }
      if (c === '"' || c === "'") { quote = c; k++; continue; }
      if (c === '{') depth++;
      else if (c === '}') depth--;
      k++;
    }
    const bodyStart = j + 1, bodyEnd = k - 1;

    if (rawPrelude.startsWith('@')) {
      const at = rawPrelude.split(/\s+/)[0];
      atBlocks.push({ at, cond: rawPrelude.slice(at.length).trim(), media, line: lineAt(i) });
      if (at === '@keyframes' || at === '@-webkit-keyframes' || at === '@font-face' || at === '@page') {
        // 内部不是选择器规则，跳过
      } else if (at === '@media' || at === '@supports' || at === '@layer' || at === '@container') {
        parseBlock(bodyStart, bodyEnd, media.concat([{ at, cond: rawPrelude.slice(at.length).trim() }]), at);
      }
      i = k; continue;
    }

    // 普通规则：抽声明
    const decls = [];
    let d = bodyStart;
    while (d < bodyEnd) {
      let e = d, dp = 0, q = null;
      while (e < bodyEnd) {
        const c = src[e];
        if (c === '/' && src[e + 1] === '*') { const cc = comments.find((x) => x.start === e); e = cc ? cc.end : e + 2; continue; }
        if (q) { if (c === '\\') e++; else if (c === q) q = null; e++; continue; }
        if (c === '"' || c === "'") { q = c; e++; continue; }
        if (c === '(') dp++;
        else if (c === ')') dp--;
        else if (dp <= 0 && c === ';') break;
        e++;
      }
      const chunk = stripComments(src, d, e).trim();
      if (chunk) {
        const colon = chunk.indexOf(':');
        if (colon > 0) {
          const prop = chunk.slice(0, colon).trim().toLowerCase();
          const value = chunk.slice(colon + 1).trim();
          if (prop && value) decls.push({ prop, value, line: lineAt(d + (chunk.length - chunk.trimStart().length)) });
        } else {
          decls.push({ prop: '<malformed>', value: chunk, line: lineAt(d) });
        }
      }
      d = e + 1;
    }
    const sel = rawPrelude;
    rules.push({ selector: sel, media, decls, line: lineAt(i), order: order++, atName });
    i = k;
  }
}
parseBlock(0, src.length, [], null);

/* ---------- 2. 重复选择器 + 同属性 ---------- */
function mediaKey(m) { return m.map((x) => x.at + ' ' + x.cond).join(' && '); }
const dupes = [];
const seen = new Map();
for (const r of rules) {
  for (const dcl of r.decls) {
    const key = r.selector + '||' + mediaKey(r.media) + '||' + dcl.prop;
    if (seen.has(key)) {
      const prev = seen.get(key);
      dupes.push({ selector: r.selector, media: mediaKey(r.media), prop: dcl.prop, first: prev.line, firstVal: prev.value, last: dcl.line, lastVal: dcl.value });
    }
    seen.set(key, { line: dcl.line, value: dcl.value });
  }
}

/* ---------- 3. min()/max()/clamp() 语法 ---------- */
function splitTopCommas(s) {
  const out = []; let cur = '', depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(') depth++;
    if (c === ')') depth--;
    if (c === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
const mathErrors = [];
for (const r of rules) for (const dcl of r.decls) {
  const re = /\b(min|max|clamp)\(/g; let m;
  while ((m = re.exec(dcl.value))) {
    const fn = m[1], start = m.index + fn.length;
    let depth = 0, i = start, end = -1;
    for (; i < dcl.value.length; i++) {
      if (dcl.value[i] === '(') depth++;
      else if (dcl.value[i] === ')') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end < 0) { mathErrors.push({ line: dcl.line, fn, args: '?', why: '括号未闭合' }); continue; }
    const inner = dcl.value.slice(start + 1, end);
    const args = splitTopCommas(inner);
    if (fn === 'clamp' && args.length !== 3) mathErrors.push({ line: dcl.line, fn, args: args.length, why: 'clamp 必须 3 个参数' });
    if ((fn === 'min' || fn === 'max') && args.length < 1) mathErrors.push({ line: dcl.line, fn, args: 0, why: '空参数' });
    if (args.some((a) => a === '')) mathErrors.push({ line: dcl.line, fn, args: args.length, why: '空参数位（多余逗号）' });
    // 混合单位但没有 var/%/计算函数时给出提示
    const units = new Set(args.map((a) => (a.match(/[a-z%]+$/i) || [''])[0].toLowerCase()).filter(Boolean));
    if (units.size > 1 && !args.some((a) => /var\(|calc\(/.test(a))) {
      // min()/max() 允许混单位，仅记录供人工判断
    }
  }
}

/* ---------- 4. .vinyl-zone 级联求值 ---------- */
function cmp(cond, vw, vh) {
  const c = cond.replace(/\s+/g, '');
  const mw = c.match(/\(max-width:([\d.]+)px\)/); const mnw = c.match(/\(min-width:([\d.]+)px\)/);
  const mh = c.match(/\(max-height:([\d.]+)px\)/); const mnh = c.match(/\(min-height:([\d.]+)px\)/);
  const mar = c.match(/\(max-aspect-ratio:([\d./]+)\)/); const mnar = c.match(/\(min-aspect-ratio:([\d./]+)\)/);
  const num = (frac) => { const [a, b] = frac.split('/'); return b === undefined ? +a : +a / +b; };
  if (mw && vw > +mw[1] + 1e-9) return false;
  if (mnw && vw < +mnw[1] - 1e-9) return false;
  if (mh && vh > +mh[1] + 1e-9) return false;
  if (mnh && vh < +mnh[1] - 1e-9) return false;
  if (mar && vw / vh > num(mar[1]) + 1e-9) return false;
  if (mnar && vw / vh < num(mnar[1]) - 1e-9) return false;
  return true;
}
function mediaMatches(media, vw, vh) {
  return media.every((m) => {
    if (m.at === '@supports') return true;           // 视为命中，另行标注
    if (m.at !== '@media') return true;
    return m.cond.split(/\band\b/).map((x) => x.trim()).filter(Boolean).every((cond) => cmp(cond, vw, vh));
  });
}
function evalExpr(v, vw, vh, parentW) {
  // 只支持 min()/max()/clamp()/百分比/px/vh/vw；百分比按 parentW 代换
  const E = (e) => {
    e = e.trim();
    let m;
    if ((m = e.match(/^min\(([\s\S]*)\)$/))) return Math.min(...splitTopCommas(m[1]).map(E));
    if ((m = e.match(/^max\(([\s\S]*)\)$/))) return Math.max(...splitTopCommas(m[1]).map(E));
    if ((m = e.match(/^clamp\(([\s\S]*)\)$/))) { const a = splitTopCommas(m[1]).map(E); return Math.min(Math.max(a[1], a[0]), a[2]); }
    if ((m = e.match(/^calc\(([\s\S]*)\)$/))) return E(m[1]);
    if ((m = e.match(/^(-?[\d.]+)%$/))) return (+m[1] / 100) * parentW;
    if ((m = e.match(/^([\d.]+)px$/))) return +m[1];
    if ((m = e.match(/^([\d.]+)vh$/))) return (+m[1] / 100) * vh;
    if ((m = e.match(/^([\d.]+)vw$/))) return (+m[1] / 100) * vw;
    if ((m = e.match(/^([\d.]+)$/))) return +m[1];
    return NaN;
  };
  return E(v);
}
const zoneRules = rules.filter((r) => /(^|,)\s*\.vinyl-zone\s*$/.test(r.selector.trim()))
  .sort((a, b) => a.order - b.order);

/* 逐视口：算出 .vinyl-zone 最终 max-width 与像素尺寸 */
const VIEWPORTS = [
  [1920, 1080], [1440, 900], [1200, 678], [1204, 617], [1024, 768],
  [768, 1024], [678, 1200], [412, 915], [390, 844], [1920, 600],
  [1181, 600], [1180, 600], [1920, 420], [915, 412], [892, 428],
];

function deckGeometry(vw, vh, overlay) {
  // --deck-w
  const clamp = (a, b, c) => Math.min(Math.max(b, a), c);
  let deckW = clamp(0.27 * vw, 320, 452);
  if (vw <= 1180) deckW = 330;
  if (vw <= 980) deckW = 300;
  // .deck padding
  const deckPadX = 16, deckPadTop = overlay ? 112 : 18;
  const deckOuter = overlay ? vw : deckW;
  const plinthAvail = deckOuter - deckPadX * 2;
  // .plinth padding（后出现的 max-width:1180 覆盖先出现的 max-height:720）
  let pp = { t: 16, x: 16, b: 10, src: '308 基础' };
  if (vh <= 720) pp = { t: 10, x: 10, b: 8, src: '1091 max-height:720' };
  if (vw <= 1180) pp = { t: 12, x: 12, b: 8, src: '1217 max-width:1180(后)' };
  let plinthW = plinthAvail;
  if (overlay) plinthW = Math.min(300, plinthAvail);   // 649 行 max-width:300
  const zoneAvail = plinthW - pp.x * 2;
  // 纵向预算
  const topH = clamp(0.054 * vh, 48, 58);
  const playerH = clamp(0.092 * vh, 78, 98);
  const deckH = overlay ? (vh - playerH - (vw <= 860 ? 58 : 0)) : (vh - topH - playerH);
  const innerH = deckH - deckPadTop;
  return { deckW: deckOuter, plinthW, zoneAvail, pp, innerH };
}

function resolveZone(vw, vh, overlay) {
  const geo = deckGeometry(vw, vh, overlay);
  const hits = [];
  let maxW = null, widthPct = 1;
  for (const r of zoneRules) {
    const matched = mediaMatches(r.media, vw, vh);
    if (!matched) continue;
    const mw = r.decls.find((d) => d.prop === 'max-width');
    const w = r.decls.find((d) => d.prop === 'width');
    if (w) widthPct = evalExpr(w.value, vw, vh, geo.zoneAvail) / geo.zoneAvail;
    if (mw) { maxW = evalExpr(mw.value, vw, vh, geo.zoneAvail); hits.push({ line: mw.line, expr: mw.value, px: maxW, order: r.order }); }
    else hits.push({ line: r.line, expr: '(无 max-width)', px: null, order: r.order });
  }
  const widthFromPct = widthPct * geo.zoneAvail;
  const px = maxW === null ? widthFromPct : Math.min(widthFromPct, maxW);
  const winner = hits.filter((h) => h.px !== null).slice(-1)[0] || null;
  return { geo, hits, W: px, H: px, winner };
}

function infoHeight(vh, badgeEmpty) {
  const kicker = 10 * 1.2;
  let h1 = 17 * 1.25, p = 12 * 1.3, badge = 9.5 * 1.2;
  if (vh <= 720) { h1 = 15.5 * 1.25; p = 11.5 * 1.3; }
  if (vh <= 640) { h1 = 14.5 * 1.25; }
  const kids = [kicker, h1, p].concat(badgeEmpty ? [] : [badge]);
  return kids.reduce((a, b) => a + b, 0) + (kids.length - 1) * 1;
}
function verticalBudget(vw, vh, W, geo, overlay) {
  const pp = geo.pp;
  const plate = 8 + 9.5 * 1.2;                    // margin-top 8 + 行高
  const plinthH = pp.t + W + plate + pp.b;
  const info = infoHeight(vh, true);
  let tabsH = 1 + 10 * 1.2 + 4 + 1;
  if (vh <= 640) tabsH = 0 + 10 * 1.2 + 3 + 1;
  let lyricMin = 150;
  if (vh <= 720) lyricMin = 130;
  const gap = 12;
  const total = (overlay ? 0 : 0) + plinthH + gap + info + gap + tabsH + gap + lyricMin;
  return { plinthH, info, tabsH, lyricMin, total, avail: geo.innerH, slack: geo.innerH - total };
}

/* ---------- 输出 ---------- */
const line = (s = '') => console.log(s);
line('================ audit5-css ================');
line('文件: ' + CSS + '  (' + L.length + ' 行, ' + src.length + ' 字符)');
line('解析: 规则 ' + rules.length + ' 条, 注释 ' + comments.length + ' 段, @块 ' + atBlocks.length + ' 个');
line('');
line('--- 1. 花括号配平 ---');
const bb = braceBalance(src);
if (!bb.length) line('OK：{ } 完全配平');
else bb.forEach((b) => line('BAD line ' + b.line + ': ' + b.msg));
line('');
line('--- 1b. 嵌套注释（CSS 注释不可嵌套） ---');
if (!nestedComments.length) line('OK：无嵌套 /*');
else nestedComments.forEach((n) => line('BAD line ' + n.line + ': 注释内部又出现 /*  —— 外层注释会在第一个 */ 处提前闭合，后续文本变成选择器 prelude'));
line('');
line('--- 2. 同名选择器 + 同属性（同媒体上下文内后者覆盖前者） ---');
if (!dupes.length) line('OK：无');
else dupes.forEach((d) => line('DUP [' + (d.media || 'global') + '] ' + d.selector + ' { ' + d.prop + ' }  L' + d.first + ' "' + d.firstVal + '"  ->  L' + d.last + ' "' + d.lastVal + '"'));
line('');
line('--- 3. min()/max()/clamp() 语法 ---');
if (!mathErrors.length) line('OK：参数个数与括号均正常');
else mathErrors.forEach((e) => line('BAD L' + e.line + ' ' + e.fn + '(): ' + e.why + ' (args=' + e.args + ')'));
const mathCount = rules.reduce((a, r) => a + r.decls.filter((d) => /(min|max|clamp)\(/.test(d.value)).length, 0);
line('（共扫描 ' + mathCount + ' 个含数学函数的声明）');
line('');
line('--- 4. .vinyl-zone 规则（按源码层叠顺序） ---');
zoneRules.forEach((r) => {
  const mw = r.decls.find((d) => d.prop === 'max-width');
  line('  L' + r.line + '  ' + (r.media.length ? mediaKey(r.media) : '(无媒体)') + '  =>  ' + (mw ? mw.value : r.decls.map((d) => d.prop + ':' + d.value).join('; ')));
});
line('');
line('--- 5. 各视口 .vinyl-zone 最终像素（overlay = body.m-deck 全屏模式） ---');
line(pad('视口', 12) + pad('模式', 8) + pad('zone可用宽', 11) + pad('命中规则', 10) + pad('max-width表达式', 26) + pad('W×H(px)', 12) + pad('plinth内容宽', 13) + pad('单侧留白', 10) + pad('纵向余量', 10));
for (const [vw, vh] of VIEWPORTS) {
  const overlay = vw <= 860;
  const r = resolveZone(vw, vh, overlay);
  const vb = verticalBudget(vw, vh, r.W, r.geo, overlay);
  line(pad(vw + 'x' + vh, 12) + pad(overlay ? 'overlay' : 'desktop', 8) + pad(fmt(r.geo.zoneAvail), 11) +
    pad(r.winner ? 'L' + r.winner.line : '-', 10) + pad(r.winner ? r.winner.expr : '-', 26) +
    pad(fmt(r.W) + 'x' + fmt(r.H), 12) +
    pad(fmt(r.geo.zoneAvail), 13) + pad(fmt((r.geo.zoneAvail - r.W) / 2), 10) +
    pad((vb.slack >= 0 ? '+' : '') + fmt(vb.slack), 10));
}
line('');
line('--- 6. 关键视口纵向明细（W + plinth padding + plate + info + tabs + lyricMin） ---');
for (const [vw, vh] of [[1920, 1080], [1204, 617], [1200, 678], [1024, 768], [1920, 600], [768, 1024]]) {
  const overlay = vw <= 860;
  const r = resolveZone(vw, vh, overlay);
  const vb = verticalBudget(vw, vh, r.W, r.geo, overlay);
  line('  ' + (vw + 'x' + vh).padEnd(10) + ' W=' + pad(fmt(r.W), 7) + ' plinth=' + pad(fmt(vb.plinthH), 7) +
    ' info=' + pad(fmt(vb.info), 7) + ' tabs=' + pad(fmt(vb.tabsH), 5) + ' lyricMin=' + pad(fmt(vb.lyricMin), 6) +
    ' 合计=' + pad(fmt(vb.total), 8) + ' 可用=' + pad(fmt(vb.avail), 8) + ' 余量=' + fmt(vb.slack) +
    '   (plinth padding 来自 ' + r.geo.pp.src + ')');
}
line('');
line('--- 7. 断点交叉验证：宽度/高度变 1px，唱片变化多少 ---');
for (const [a, b] of [[[1181, 600], [1180, 600]], [[1181, 617], [1180, 617]], [[1440, 700], [1180, 700]], [[1920, 641], [1920, 640]]]) {
  const ra = resolveZone(a[0], a[1], false), rb = resolveZone(b[0], b[1], false);
  line('  ' + a[0] + 'x' + a[1] + ' -> ' + fmt(ra.W) + 'px (' + (ra.winner ? 'L' + ra.winner.line : '-') + ')  |  ' +
    b[0] + 'x' + b[1] + ' -> ' + fmt(rb.W) + 'px (' + (rb.winner ? 'L' + rb.winner.line : '-') + ')   Δ=' + fmt(rb.W - ra.W) + 'px');
}
line('');
line('--- 8. 语法/属性拼写抽查 ---');
const badDecl = rules.flatMap((r) => r.decls.filter((d) => d.prop === '<malformed>').map((d) => ({ line: d.line, v: d.value })));
if (!badDecl.length) line('OK：无缺冒号的声明');
else badDecl.forEach((b) => line('BAD L' + b.line + ': ' + b.v));
const known = new Set(['position','width','height','max-width','max-height','min-width','min-height','aspect-ratio','margin','margin-top','padding','display','flex','flex-direction','flex-shrink','overflow','overflow-y','overflow-x','min-height','gap','background','background-image','background-size','background-position','background-clip','color','font-size','font-family','font-weight','letter-spacing','line-height','text-align','text-overflow','white-space','border','border-radius','border-left','border-top','border-bottom','box-shadow','opacity','transform','transform-origin','transition','transition-property','animation','animation-play-state','will-change','backface-visibility','-webkit-backface-visibility','contain','z-index','top','right','bottom','left','inset','grid-area','grid-template-columns','grid-template-rows','grid-template-areas','place-items','align-items','justify-content','pointer-events','cursor','mix-blend-mode','filter','object-fit','flex-basis','visibility','content','font-style','text-shadow','text-decoration','list-style','outline','appearance','border-collapse','border-color','border-width','border-style','user-select','touch-action','overscroll-behavior','-webkit-mask-image','mask-image','background-color','columns','word-break','align-self','order','float','clear','vertical-align','text-transform','direction','writing-mode','zoom','scrollbar-width','-webkit-line-clamp','-webkit-box-orient','box-sizing','min-inline-size','max-inline-size','inline-size','block-size','grid-column','grid-row','grid-template','justify-self','align-content','row-gap','column-gap','font-variant','fill','stroke','stroke-width','stop-color','background-repeat','background-attachment','backdrop-filter']);
const unknownProps = new Map();
for (const r of rules) for (const d of r.decls) if (!known.has(d.prop) && !d.prop.startsWith('--')) unknownProps.set(d.prop, (unknownProps.get(d.prop) || 0) + 1);
if (unknownProps.size) line('提示：不在白名单内的属性（需人工确认）：' + [...unknownProps].map(([k, v]) => k + '×' + v).join(', '));
else line('OK：全部属性名在白名单内');
line('============================================');

function pad(s, n) { s = String(s); return s + ' '.repeat(Math.max(0, n - s.length)); }
function fmt(n) { return Number.isFinite(n) ? String(Math.round(n * 10) / 10) : String(n); }
