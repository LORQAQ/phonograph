'use strict'
const fs = require('node:fs')
const p = 'public/app.js'
let s = fs.readFileSync(p, 'utf8')
const before = (s.match(/renderCollectionsView\(\)/g) || []).length
s = s.replace(/renderCollectionsView\(\)/g, 'renderLibraryView()')
fs.writeFileSync(p, s, 'utf8')
console.log('replaced calls:', before)
