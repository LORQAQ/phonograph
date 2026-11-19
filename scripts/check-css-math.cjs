'use strict'
/* 按 CSS 规则算各视口下黑胶区的实际高度，确认歌词区一定有余量 */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

const css = fs.readFileSync('public/style.css', 'utf8')

console.log('=== 当前生效的黑胶区高度规则（按源码顺序，后面的覆盖前面的）===\n')

/* 抽出所有 .vinyl-zone 的 max-height 声明，按出现顺序 */
const decls = []
const re = /\.vinyl-zone\s*\{([^}]*)\}/g
let m
while ((m = re.exec(css))) {
  const body = m[1]
  const mh = body.match(/max-height\s*:\s*([^;]+)/)
  const h = body.match(/(?:^|[;\s])height\s*:\s*([^;]+)/)
  const ar = body.match(/aspect-ratio\s*:\s*([^;]+)/)
  if (mh || h || ar) {
    decls.push({ maxH: mh ? mh[1].trim() : null, height: h ? h[1].trim() : null, ar: ar ? ar[1].trim() : null })
  }
}
decls.forEach((d, i) => console.log('  ' + (i + 1) + '. max-height=' + (d.maxH || '-') + '  height=' + (d.height || '-') + '  aspect=' + (d.ar || '-')))

/* 媒体查询里的 */
console.log('\n=== 媒体查询里的覆盖 ===')
const mediaRe = /@media\s*\(([^)]+)\)\s*\{([\s\S]{0,900}?)\n\}/g
while ((m = mediaRe.exec(css))) {
  if (m[2].includes('.vinyl-zone')) {
    const mh = m[2].match(/\.vinyl-zone\s*\{[^}]*max-height\s*:\s*([^;]+)/)
    if (mh) console.log('  @media (' + m[1].trim() + ') → ' + mh[1].trim())
  }
}

/* 计算 */
function calc (vw, vh) {
  /* 匹配的规则：按宽度/高度从小到大覆盖 */
  let val = 'min(32vh,280px)'   /* 基准 */
  const rules = [
    { cond: vw <= 1180, v: 'min(34vh,300px)' },
    { cond: vw <= 980, v: 'min(30vh,260px)' },
    { cond: vw <= 860, v: 'min(28vh,240px)' },
    { cond: vh <= 720, v: 'min(26vh,220px)' },
    { cond: vh <= 640, v: 'min(22vh,190px)' },
  ]
  /* 后面的规则覆盖前面的（CSS 源码顺序） */
  for (const r of rules) {
    if (r.cond && /min\((\d+)vh/.test(r.v)) val = r.v
  }
  const mm = val.match(/min\((\d+)vh,\s*(\d+)px\)/)
  if (!mm) return { expr: val, px: null }
  const px = Math.min(vh * Number(mm[1]) / 100, Number(mm[2]))
  return { expr: val, px: Math.round(px) }
}

/* 更准确：逐条应用 */
function calc2 (vw, vh) {
  let expr = 'min(32vh,280px)'
  const seq = [
    [() => vw <= 1180, 'min(34vh,300px)'],
    [() => vw <= 980, 'min(30vh,260px)'],
    [() => vw <= 860, 'min(28vh,240px)'],
    [() => vh <= 720, 'min(26vh,220px)'],
    [() => vh <= 640, 'min(22vh,190px)'],
  ]
  for (const [cond, v] of seq) if (cond()) expr = v
  const mm = expr.match(/min\((\d+)vh,\s*(\d+)px\)/)
  const px = Math.min(vh * Number(mm[1]) / 100, Number(mm[2]))
  return { expr, px: Math.round(px) }
}

console.log('\n=== 各视口下的黑胶区高度（px）与歌词剩余空间 ===')
const viewports = [
  [1200, 678], [1204, 617], [1920, 1080], [1440, 900], [1280, 800],
  [1024, 768], [768, 1024], [678, 1200], [412, 915], [390, 844],
]
/* 固定占用：info(~85) + tabs(~24) + 底栏(~64) + padding(~30) */
const FIXED = 203
for (const [vw, vh] of viewports) {
  const r = calc2(vw, vh)
  const left = vh - r.px - FIXED
  const verdict = left >= 150 ? '充裕' : (left >= 100 ? '够用' : (left >= 60 ? '偏紧' : '不足'))
  console.log('  ' + String(vw).padStart(4) + 'x' + String(vh).padEnd(5) +
    '  黑胶 ' + String(r.px).padStart(3) + 'px (' + r.expr + ')' +
    '   歌词剩余 ' + String(left).padStart(4) + 'px  ' + verdict)
}

console.log('\n=== 结论 ===')
const bad = viewports.filter(([vw, vh]) => {
  const r = calc2(vw, vh)
  return (vh - r.px - FIXED) < 100
})
if (bad.length === 0) console.log('  ✓ 所有测试视口下歌词区都 >= 100px')
else {
  console.log('  ✗ 这些视口歌词区不足 100px:')
  bad.forEach(([vw, vh]) => {
    const r = calc2(vw, vh)
    console.log('    ' + vw + 'x' + vh + ' → ' + (vh - r.px - FIXED) + 'px')
  })
}
