const fs = require('node:fs')
const html = fs.readFileSync('C:/Users/Administrator/Documents/deepseek-harness/default-workspace/lx-music-clone/public/index.html', 'utf8')
const lines = html.split('\n')
let depth = 0
lines.forEach((l, i) => {
  const o = (l.match(/<div[ >]/g) || []).length
  const c = (l.match(/<\/div>/g) || []).length
  depth += o - c
  if (o || c) console.log(String(i + 1).padStart(4), 'depth=' + depth, l.trim().slice(0, 90))
})
