'use strict'
/* 改名：LX Phonograph -> 留声 Phonograph */
const fs = require('node:fs')

// index.html
let html = fs.readFileSync('public/index.html', 'utf8')
html = html.replace('<title>LX Phonograph</title>', '<title>留声 · Phonograph</title>')
html = html.replace('<b>LX PHONOGRAPH</b>', '<b>留声 PHONOGRAPH</b>')
html = html.replace('<span>LX · DIRECT DRIVE</span>', '<span>留声 · DIRECT DRIVE</span>')
fs.writeFileSync('public/index.html', html, 'utf8')

// NativeShell.cs
let cs = fs.readFileSync('scripts/NativeShell.cs', 'utf8')
cs = cs.split('"LX Phonograph"').join('"留声 · Phonograph"')
cs = cs.replace('//  LX Phonograph · 原生窗口外壳', '//  留声 Phonograph · 原生窗口外壳')
fs.writeFileSync('scripts/NativeShell.cs', cs, 'utf8')

// lyric window 标题
const ly = 'public/lyric-window.html'
if (fs.existsSync(ly)) {
  let l = fs.readFileSync(ly, 'utf8')
  l = l.replace(/<title>[^<]*<\/title>/, '<title>留声 · 桌面歌词</title>')
  fs.writeFileSync(ly, l, 'utf8')
}

console.log('改名完成')
