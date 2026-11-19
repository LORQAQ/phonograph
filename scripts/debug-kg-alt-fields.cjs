'use strict'
/* 打印 get_other_list_file 返回的完整字段 */
const path = require('node:path')
process.chdir(path.resolve(__dirname, '..'))
const mod = require(path.join(process.cwd(), 'app', 'lib', 'kugou-gcid.js'))

;(async () => {
  const gcid = 'gcid_3znx57dpz2tz0b7'
  const { globalId } = await mod.decodeGcid(gcid)
  const r = await mod.getSongPageAlt(globalId, 1, 3)
  console.log('total=' + r.total + ' list=' + r.list.length)

  if (r.list[0]) {
    console.log('\n=== get_other_list_file 第一首全部字段 ===')
    Object.keys(r.list[0]).sort().forEach((k) => {
      const v = r.list[0][k]
      const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
      console.log('  ' + k.padEnd(26) + ' = ' + s.slice(0, 90))
    })
  }
})()
