'use strict'
const fs = require('node:fs')
const path = require('node:path')
const html = fs.readFileSync(path.join(__dirname, '..', 'build', '_audit4_gcid.html'), 'utf8')
const m = /window\.\$output\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/.exec(html)
const o = JSON.parse(m[1])
for (const s of o.info.songs.slice(0, 5)) {
  const tp = s.trans_param || {}
  console.log(JSON.stringify({
    name: s.name,
    remark: s.remark,
    singerinfo: (s.singerinfo || []).map((x) => x.name),
    cover: s.cover,
    union_cover: tp.union_cover,
    union_cover_od: tp.union_cover_od,
    timelen: s.timelen,
    duration: s.duration,
    album_id: s.album_id,
    feetype: s.feetype,
    privilege: s.privilege,
  }))
}
