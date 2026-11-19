'use strict'
/* 审计用：实测 kugou-gcid.js 的三个接口与字段形状 */
process.chdir(require('path').join(__dirname, '..'))
const kg = require('../app/lib/kugou-gcid.js')

const GCID = process.argv[2] || 'gcid_3znx57dpz2tz0b7'

const show = (label, v) => {
  let s
  try { s = JSON.stringify(v) } catch (e) { s = String(v) }
  if (s && s.length > 900) s = s.slice(0, 900) + ' …(len=' + s.length + ')'
  console.log('\n### ' + label + '\n' + s)
}

;(async () => {
  console.log('== gcid =', GCID)
  // 1) 签名自检：同样参数两次签名应一致，且与"split&sort"定义一致
  const p = 'b=2&a=1&c=3'
  console.log('sign(android,' + p + ') =', kg.signatureParams(p, 'android'))
  console.log('sign sorted-keys variant =', require('crypto').createHash('md5')
    .update('OIlwieks28dk2k092lksi2UIkp' + p.split('&').sort().join('') + '' + 'OIlwieks28dk2k092lksi2UIkp').digest('hex'))

  let t = Date.now()
  try {
    const d = await kg.decodeGcid(GCID)
    console.log('\n[1] decodeGcid OK in', Date.now() - t, 'ms')
    show('decodeGcid result', d)
    var globalId = d.globalId
  } catch (e) {
    console.log('\n[1] decodeGcid FAIL in', Date.now() - t, 'ms:', e.message)
  }

  if (globalId) {
    t = Date.now()
    try {
      const info = await kg.getListInfo(globalId)
      console.log('\n[2] getListInfo OK in', Date.now() - t, 'ms')
      show('getListInfo', info)
    } catch (e) { console.log('\n[2] getListInfo FAIL:', e.message) }

    for (const page of [1]) {
      t = Date.now()
      try {
        const r = await kg.getSongPage(globalId, page, 300)
        console.log('\n[3] getSongPage p' + page + ' OK in', Date.now() - t, 'ms total=' + r.total + ' list=' + r.list.length)
        show('page1 first item', r.list[0])
        // 字段覆盖统计
        const keys = {}
        for (const x of r.list) for (const k of Object.keys(x)) keys[k] = (keys[k] || 0) + 1
        show('field coverage', keys)
        const durs = r.list.map((x) => x.duration).filter(Boolean)
        show('duration sample (raw)', durs.slice(0, 8))
        const names = r.list.map((x) => x.filename || x.name)
        const moji = names.filter((s) => String(s).includes('\uFFFD'))
        console.log('mojibake names:', moji.length, moji.slice(0, 3))
        const withRemark = r.list.filter((x) => x.remark).slice(0, 3).map((x) => ({ filename: x.filename, remark: x.remark, songname: x.songname }))
        show('remark samples', withRemark)
        show('singerinfo sample', r.list.slice(0, 2).map((x) => ({ singerinfo: x.singerinfo, singername: x.singername })))
        show('mapped[0..2]', r.list.slice(0, 3).map((x) => kg.mapKgSong(x)))
      } catch (e) { console.log('\n[3] getSongPage FAIL:', e.message, e.code) }
    }
  }

  t = Date.now()
  try {
    const r = await kg.fetchGcidPlaylist(GCID, { maxSongs: 2000 })
    console.log('\n[4] fetchGcidPlaylist OK in', Date.now() - t, 'ms  songs=' + r.songs.length + ' total=' + r.total + ' truncated=' + r.truncated + ' name=' + r.name)
    const moji = r.songs.filter((s) => /[\uFFFD]/.test(s.name + s.singer + s.album))
    console.log('mojibake songs:', moji.length, moji.slice(0, 3).map((s) => s.name + '/' + s.singer))
    const dupId = new Set(); let dup = 0
    for (const s of r.songs) { if (dupId.has(s.id)) dup++; dupId.add(s.id) }
    console.log('dup ids:', dup)
    const sameName = {}
    for (const s of r.songs) (sameName[s.name] = sameName[s.name] || []).push(s.id)
    const groups = Object.entries(sameName).filter(([, v]) => v.length > 1)
    console.log('同名不同 hash 组数:', groups.length, groups.slice(0, 3))
    show('songs[0..2]', r.songs.slice(0, 3))
    const durs = r.songs.map((s) => s.duration)
    console.log('duration 范围:', Math.min(...durs), Math.max(...durs))
  } catch (e) {
    console.log('\n[4] fetchGcidPlaylist FAIL:', e.message)
  }
})()
