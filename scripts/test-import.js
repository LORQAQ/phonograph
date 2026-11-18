'use strict'
/* 歌单导入接口测试 */
const BASE = 'http://127.0.0.1:37621'
const cases = [
  ['网易云', 'https://music.163.com/#/playlist?id=24381616'],
  ['QQ', 'https://y.qq.com/n/ryqq/playlist/7011264340'],
  ['酷狗', 'https://www.kugou.com/yy/special/single/313869.html'],
]

;(async () => {
  for (const [name, url] of cases) {
    try {
      const res = await fetch(BASE + '/api/playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'import', url }),
      })
      const data = await res.json()
      if (!res.ok) { console.log('❌', name, data.error); continue }
      const imp = data.imported
      console.log('✅', name, '->', imp.name, imp.count, '首', '| 歌单总数', data.playlists.length)
    } catch (e) {
      console.log('❌', name, e.message)
    }
  }
})()
