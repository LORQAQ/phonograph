'use strict'
/* 分析 uiautomator dump，确认右上角 ? 是谁画的 */
const fs = require('node:fs')

const path = 'C:/Users/Administrator/Documents/deepseek-harness/default-workspace/apk-build/ui.xml'
if (!fs.existsSync(path)) {
  console.log('ui.xml 不存在，先 dump')
  process.exit(1)
}

const x = fs.readFileSync(path, 'utf8')
console.log('ui.xml 大小: ' + (x.length / 1024).toFixed(1) + ' KB')

/* 提取所有 node */
const nodes = []
const re = /<node\s+([^>]+?)\/?>/g
let m
while ((m = re.exec(x)) !== null) {
  const attrs = {}
  const attrRe = /([\w-]+)="([^"]*)"/g
  let a
  while ((a = attrRe.exec(m[1])) !== null) attrs[a[1]] = a[2]
  nodes.push(attrs)
}

console.log('节点数: ' + nodes.length)

/* 找 text 含 ? 的 */
console.log('\n=== text 含 ? 的节点 ===')
const q = nodes.filter((n) => (n.text || '').includes('?'))
if (q.length) {
  q.forEach((n) => {
    console.log('  class=' + (n.class || '-') + ' text="' + n.text + '" bounds=' + (n.bounds || '-') + ' pkg=' + (n.package || '-'))
  })
} else {
  console.log('  无')
}

/* 找 bounds 在右上区域的节点（x>800, y<200） */
console.log('\n=== 右上角区域（x>800 且 y<200）===')
const topRight = nodes.filter((n) => {
  if (!n.bounds) return false
  const b = n.bounds.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/)
  if (!b) return false
  return Number(b[1]) > 800 && Number(b[2]) < 200
})
if (topRight.length) {
  topRight.forEach((n) => {
    console.log('  ' + (n.class || '-') + '  text="' + (n.text || '') + '"  desc="' + (n['content-desc'] || '') + '" bounds=' + n.bounds + '  pkg=' + n.package)
  })
} else {
  console.log('  无')
}

/* 列出所有出现的 package */
console.log('\n=== 涉及的包 ===')
const pkgs = [...new Set(nodes.map((n) => n.package).filter(Boolean))]
pkgs.forEach((p) => console.log('  ' + p))
