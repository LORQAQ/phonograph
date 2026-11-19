'use strict'
/* 修酷狗 gcid 歌单名字段：window.$output.info.listinfo.name */
const fs = require('node:fs')
const p = 'mobile/www/api-mobile.js'
let s = fs.readFileSync(p, 'utf8')

const OLD = `        const nameM = /"specialname"\\s*:\\s*"([^"]{1,80})"/.exec(text)`

const NEW = `        /* 歌单名在 window.$output.info.listinfo.name */
        let plName = ''
        let plCover = ''
        const li = /"listinfo"\\s*:\\s*\\{/.exec(text)
        if (li) {
          const seg = text.slice(li.index, li.index + 3000)
          const nm = /"name"\\s*:\\s*"([^"]{1,80})"/.exec(seg)
          if (nm) plName = nm[1]
          const pc = /"pic"\\s*:\\s*"([^"]{10,200})"/.exec(seg)
          if (pc) plCover = pc[1].replace(/\\\\\\//g, '/').replace('{size}', '300')
        }
        if (!plName) {
          const nm2 = /"specialname"\\s*:\\s*"([^"]{1,80})"/.exec(text)
          if (nm2) plName = nm2[1]
        }`

if (s.includes(OLD)) {
  s = s.replace(OLD, NEW)
  /* 返回处也要用 plName */
  s = s.replace(
    `        return { platform: 'kg', name: nameM ? nameM[1] : '酷狗歌单', songs, skipped: 0 }`,
    `        return { platform: 'kg', name: plName || '酷狗歌单', cover: plCover, songs, skipped: 0 }`
  )
  fs.writeFileSync(p, s, 'utf8')
  console.log('✓ 歌单名改用 listinfo.name')
} else {
  console.log('未匹配')
  const i = s.indexOf('specialname')
  if (i > 0) console.log(s.slice(Math.max(0, i - 200), i + 200))
}
