'use strict'
/* 在 Node 里验证移动端数据层（音乐接口模块）是否可用 */
const path = require('node:path')
const { request } = require(path.resolve(__dirname, '../app/lib/lx-engine.js'))

globalThis.__REQ__ = request
globalThis.window = globalThis

require(path.resolve(__dirname, '../mobile/www/lib/music-libs.js'))

;(async () => {
  const t = async (label, fn) => {
    try {
      const v = await fn()
      console.log('✅', label, '→', v)
    } catch (e) {
      console.log('❌', label, '→', e.message)
    }
  }

  await t('网易云搜索 周杰伦', async () => {
    const r = await NET_WY.search('周杰伦', 1, 5)
    return r.list.length + ' 首, 首曲: ' + (r.list[0] && r.list[0].name)
  })
  await t('网易云榜单 hot', async () => {
    const r = await NET_WY.toplist('hot')
    return (r.name || '') + ' ' + (r.list || []).length + ' 首'
  })
  await t('网易云推荐歌单', async () => {
    const r = await NET_WY.recommendPlaylists(0, 6)
    return r.length + ' 个, 首个: ' + (r[0] && r[0].name)
  })
  await t('网易云歌词', async () => {
    const r = await NET_WY.lyric('1824045033')
    return (r.lyric || '').slice(0, 24).replace(/\n/g, ' ')
  })
  await t('QQ 搜索', async () => {
    const r = await NET_TX.search('周杰伦', 1, 5)
    return r.list.length + ' 首, 首曲: ' + (r.list[0] && r.list[0].name)
  })
  await t('QQ 榜单', async () => {
    const r = await NET_TX.toplist('hot')
    return (r.name || '') + ' ' + (r.list || []).length + ' 首'
  })
  await t('酷狗搜索', async () => {
    const r = await NET_KG.search('周杰伦', 1, 5)
    return r.list.length + ' 首, 首曲: ' + (r.list[0] && r.list[0].name)
  })
  await t('酷狗榜单 TOP500', async () => {
    const r = await NET_KG.toplist('top500')
    return (r.name || '') + ' ' + (r.list || []).length + ' 首'
  })
  await t('歌单链接识别', async () => {
    const d = NET_IMPORT.detect('https://music.163.com/#/playlist?id=3778678')
    return JSON.stringify(d)
  })
})()
