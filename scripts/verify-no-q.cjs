'use strict'
/* 验证问号是否已从原生层移除 */
const fs = require('node:fs')

const p = 'C:/Users/Administrator/Documents/deepseek-harness/default-workspace/apk-build/ui2.xml'
if (!fs.existsSync(p)) {
  console.log('ui2.xml 不存在')
  process.exit(1)
}

const x = fs.readFileSync(p, 'utf8')
console.log('ui2.xml 大小: ' + (x.length / 1024).toFixed(1) + ' KB')
console.log('还含 text="?" : ' + x.includes('text="?"'))

/* 列出所有节点文本 */
const nodes = []
const re = /<node\s+([^>]+?)\/?>/g
let m
while ((m = re.exec(x)) !== null) {
  const attrs = {}
  const ar = /([\w-]+)="([^"]*)"/g
  let a
  while ((a = ar.exec(m[1])) !== null) attrs[a[1]] = a[2]
  nodes.push(attrs)
}

console.log('\n节点总数: ' + nodes.length)
console.log('\n=== 有文字的节点 ===')
nodes.forEach((n) => {
  const t = (n.text || '').trim()
  const d = (n['content-desc'] || '').trim()
  if (t || d) {
    console.log('  ' + (n.class || '-') + '  text="' + t + '"  desc="' + d + '"  bounds=' + (n.bounds || '-'))
  }
})

console.log('\n=== 右上区域（x>800,y<200）===')
nodes.forEach((n) => {
  if (!n.bounds) return
  const b = n.bounds.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/)
  if (!b) return
  if (Number(b[1]) > 800 && Number(b[2]) < 200) {
    console.log('  ' + (n.class || '-') + '  text="' + (n.text || '') + '"  bounds=' + n.bounds)
  }
})
