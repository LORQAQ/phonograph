'use strict'
/* 在安卓 WebView 里逐项跑功能测试（通过 CDP）
 * 用法：node scripts/test-emulator.js
 */
const http = require('node:http')

const PORT = 9333

function get (path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: PORT, path }, (res) => {
      let d = ''
      res.on('data', (c) => { d += c })
      res.on('end', () => { try { resolve(JSON.parse(d)) } catch (e) { reject(e) } })
    }).on('error', reject)
  })
}

function wsConnect (url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const req = http.request({
      host: u.hostname, port: u.port, path: u.pathname + u.search,
      headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': Buffer.from(String(Math.random())).toString('base64'), 'Sec-WebSocket-Version': '13' },
    })
    req.on('upgrade', (res, socket) => resolve(socket))
    req.on('error', reject)
    req.end()
  })
}

function makeSend (socket) {
  let id = 0
  const pending = new Map()
  let buf = Buffer.alloc(0)
  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk])
    while (buf.length >= 2) {
      const len0 = buf[1] & 0x7f
      let offset = 2
      let len = len0
      if (len0 === 126) { len = buf.readUInt16BE(2); offset = 4 } else if (len0 === 127) { len = Number(buf.readBigUInt64BE(2)); offset = 10 }
      if (buf.length < offset + len) break
      const payload = buf.slice(offset, offset + len).toString()
      buf = buf.slice(offset + len)
      try {
        const msg = JSON.parse(payload)
        if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) }
      } catch (e) {}
    }
  })
  return (method, params) => new Promise((resolve) => {
    const myId = ++id
    pending.set(myId, resolve)
    const s = JSON.stringify({ id: myId, method, params: params || {} })
    const payload = Buffer.from(s)
    const header = payload.length < 126
      ? Buffer.from([0x81, 0x80 | payload.length])
      : Buffer.from([0x81, 0x80 | 126, payload.length >> 8, payload.length & 255])
    const mask = Buffer.from([1, 2, 3, 4])
    const masked = Buffer.from(payload.map((b, i) => b ^ mask[i % 4]))
    socket.write(Buffer.concat([header, mask, masked]))
  })
}

const TESTS = [
  ['网易云搜索', `(async()=>{const r=await api('/api/search?kw=周杰伦&page=1&limit=10&source=wy');if(!r.list||!r.list.length)throw new Error('无结果');return r.list.length+' 首 · '+r.list[0].name})()`],
  ['QQ 搜索', `(async()=>{const r=await api('/api/search?kw=周杰伦&page=1&limit=10&source=tx');if(!r.list||!r.list.length)throw new Error('无结果');return r.list.length+' 首 · '+r.list[0].name})()`],
  ['酷狗搜索', `(async()=>{const r=await api('/api/search?kw=周杰伦&page=1&limit=10&source=kg');if(!r.list||!r.list.length)throw new Error('无结果');return r.list.length+' 首 · '+r.list[0].name})()`],
  ['网易云榜单', `(async()=>{const r=await api('/api/toplist?source=wy&type=hot');if(!r.list||!r.list.length)throw new Error('无数据');return r.name+' · '+r.list.length+' 首'})()`],
  ['QQ 榜单', `(async()=>{const r=await api('/api/toplist?source=tx&type=hot');if(!r.list||!r.list.length)throw new Error('无数据');return r.name+' · '+r.list.length+' 首'})()`],
  ['酷狗 TOP500', `(async()=>{const r=await api('/api/toplist?source=kg&type=top500');if(!r.list||!r.list.length)throw new Error('无数据');return r.name+' · '+r.list.length+' 首'})()`],
  ['推荐歌单', `(async()=>{const r=await api('/api/discover?source=wy&offset=0&limit=12');if(!r.playlists||!r.playlists.length)throw new Error('无推荐');return r.playlists.length+' 个封面'})()`],
  ['推荐分页', `(async()=>{const r=await api('/api/discover?source=wy&offset=30&limit=12');if(!r.playlists||!r.playlists.length)throw new Error('第二页为空');return '第2页 '+r.playlists.length+' 个'})()`],
  ['歌单预览', `(async()=>{const r=await api('/api/playlist',{method:'POST',body:{action:'preview',url:'https://music.163.com/#/playlist?id=3778678'}});if(!r.songs||!r.songs.length)throw new Error('无歌曲');return r.preview.name.slice(0,14)+' · '+r.songs.length+' 首'})()`],
  ['导入歌单', `(async()=>{const r=await api('/api/playlist',{method:'POST',body:{action:'import',url:'https://music.163.com/#/playlist?id=3778678'}});if(!r.imported)throw new Error('导入失败');window.__importedId=r.imported.id;return '导入 '+r.imported.count+' 首'})()`],
  ['新建歌单', `(async()=>{const r=await api('/api/playlist',{method:'POST',body:{action:'create',name:'测试歌单'}});if(!r.playlist)throw new Error('新建失败');window.__testPl=r.playlist.id;return 'id='+r.playlist.id})()`],
  ['歌单重命名', `(async()=>{const r=await api('/api/playlist',{method:'POST',body:{action:'rename',id:window.__testPl,name:'改名成功'}});const p=r.playlists.find(x=>x.id===window.__testPl);if(!p||p.name!=='改名成功')throw new Error('重命名失败');return p.name})()`],
  ['歌单加歌', `(async()=>{const s={id:'1824045033',name:'测试歌曲',singer:'测试',source:'wy'};const r=await api('/api/playlist',{method:'POST',body:{action:'add',id:window.__testPl,song:s}});const p=r.playlists.find(x=>x.id===window.__testPl);if(!p||!p.songs.length)throw new Error('加歌失败');return p.songs.length+' 首'})()`],
  ['歌单删歌单', `(async()=>{const r=await api('/api/playlist',{method:'POST',body:{action:'delete',id:window.__testPl}});if(r.playlists.some(x=>x.id===window.__testPl))throw new Error('删除失败');return '已删除，剩 '+r.playlists.length+' 个'})()`],
  ['取流 网易云', `(async()=>{const r=await api('/api/url?id=1824045033&source=wy&quality=320k');if(!r.url)throw new Error('无地址');return r.provider+' · '+r.quality})()`],
  ['取流 QQ音乐', `(async()=>{const r=await api('/api/url?id=0039MnYb0qxYhV&source=tx&quality=320k');if(!r.url)throw new Error('无地址');return r.provider+' · '+r.quality})()`],
  ['取流 酷狗', `(async()=>{const r=await api('/api/url?id=2A94C92B62066D1905C870DEF8C22C70&source=kg&quality=320k');if(!r.url)throw new Error('无地址');return r.provider+' · '+r.quality})()`],
  ['音质降级', `(async()=>{const r=await api('/api/url?id=1824045033&source=wy&quality=flac24bit');if(!r.url)throw new Error('无地址');return '实际 '+r.quality})()`],
  ['歌词', `(async()=>{const r=await api('/api/lyric?id=1824045033&source=wy');if(!r.lyric)throw new Error('无歌词');return r.lyric.split('\\n').length+' 行'})()`],
  ['封面地址', `(async()=>{const r=await api('/api/pic?id=1824045033&source=wy');if(!r.url)throw new Error('无封面');return r.url.slice(0,40)})()`],
  ['最近播放', `(function(){if(!Array.isArray(state.recent))throw new Error('无字段');return state.recent.length+' 首'})()`],
  ['播放控制', `(function(){const before=!audio.paused;togglePlay();const mid=!audio.paused;togglePlay();return '暂停/播放切换 '+(before!==mid?'OK':'异常')})()`],
  ['倍速切换', `(function(){const b=audio.playbackRate;cycleSpeed();const a=audio.playbackRate;return b+'x → '+a+'x'})()`],
  ['循环模式', `(function(){const b=state.mode;cycleMode();const a=state.mode;return b+' → '+a})()`],
  ['音量/静音', `(function(){const b=audio.muted;toggleMute();const a=audio.muted;toggleMute();return '静音切换 '+(b!==a?'OK':'异常')})()`],
  ['音量设置', `(function(){const b=audio.volume;setVolume(0.35);const a=audio.volume;setVolume(b);return b.toFixed(2)+' → '+a.toFixed(2)})()`],
  ['睡眠定时', `(function(){setSleep(30);const has=!!state.sleepTimer;setSleep(0);return '设置='+has+' 取消='+!state.sleepTimer})()`],
  ['队列加入', `(function(){const s={id:'1824045033',name:'队列测试',singer:'t',source:'wy'};playSong(s,[s]);if(!state.queue.length)throw new Error('队列为空');return '队列 '+state.queue.length+' 首'})()`],
  ['队列清空', `(function(){toggleQueue(true);const b=document.getElementById('btnQueueClear');if(!b)throw new Error('无按钮');b.click();return '清空后 '+state.queue.length+' 首'})()`],
  ['主题切换', `(function(){const b=document.body.className;setThemeMode('dark');const d=document.body.className;setThemeMode('light');return (d.includes('theme-light')?'':'dark ok')+' / 回到 '+document.body.className})()`],
  ['配色切换', `(function(){setTheme('#d0483c');const c=getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();setTheme('#1f9d55');return '临时红色 '+c})()`],
  ['音源脚本', `(function(){const l=window.LxScriptManager.list();if(!l.length)throw new Error('无脚本');const ok=l.filter(x=>x.status==='ok').length;return l.length+' 个（正常 '+ok+'）'})()`],
  ['音源启停', `(function(){const l=window.LxScriptManager.list();const id=l[0].id;window.LxScriptManager.toggle(id,false);const off=window.LxScriptManager.list().find(x=>x.id===id).enabled;window.LxScriptManager.toggle(id,true);const on=window.LxScriptManager.list().find(x=>x.id===id).enabled;return '停用→'+off+' 恢复→'+on})()`],
  ['音源测速', `(async()=>{const r=await window.LxScriptManager.testAll('wy');const ok=r.filter(x=>x.ok).length;return r.length+' 个，可用 '+ok})()`],
  ['桌面歌词', `(function(){if(!window.NAPI||!window.NAPI.lyricCanShow)throw new Error('无接口');const can=window.NAPI.lyricCanShow();window.NAPI.lyricShow('测试歌词','下一句');const v=window.NAPI.lyricVisible();window.NAPI.lyricHide();return '权限='+can+' 显示='+v})()`],
  ['下载接口', `(function(){if(!window.NAPI||!window.NAPI.download)throw new Error('无接口');return 'NAPI.download 就绪'})()`],
  ['本地存储', `(function(){localStorage.setItem('__t','1');const v=localStorage.getItem('__t');localStorage.removeItem('__t');if(v!=='1')throw new Error('读写失败');return 'localStorage OK'})()`],
  ['NAPI 探活', `(async()=>{const ok=await window.NativeHttp.probe('https://iot102.music.126.net/Yml6PWlvdCZjaGFubmVsPW5ldGVhc2Umc2NlbmU9YW5kcmNhcg/20261117194322/b92d57142f9f874dc4daf52a94335e16/jdymusic/obj/wo3DlMOGwrbDjj7DisKw/34736155295/bedd/660e/f603/2d97f15ccd7ff242483b1a687e7b2a1c.mp3');return 'probe='+ok})()`],
]

;(async () => {
  const targets = await get('/json/list')
  const page = targets.find((t) => t.type === 'page')
  if (!page) { console.log('未找到页面'); process.exit(1) }
  const socket = await wsConnect(page.webSocketDebuggerUrl)
  const send = makeSend(socket)
  await send('Runtime.enable')

  let pass = 0
  let fail = 0
  const fails = []

  console.log('页面:', page.url)
  console.log('─'.repeat(72))
  for (const [name, expr] of TESTS) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    const res = r.result && r.result.result
    const ex = r.result && r.result.exceptionDetails
    if (ex || (res && res.subtype === 'error')) {
      fail++
      const msg = (ex && (ex.exception && (ex.exception.description || ex.exception.value))) || (res && res.description) || '未知错误'
      const line = String(msg).split('\n')[0].slice(0, 90)
      fails.push(name + ': ' + line)
      console.log('✗ ' + name.padEnd(12) + ' ' + line)
    } else {
      pass++
      const v = (res && res.value) !== undefined ? res.value : '(undefined)'
      console.log('✓ ' + name.padEnd(12) + ' ' + String(v).slice(0, 60))
    }
  }

  console.log('─'.repeat(72))
  console.log('通过 ' + pass + ' / 失败 ' + fail)
  if (fails.length) {
    console.log('\n失败项：')
    fails.forEach((f) => console.log('  - ' + f))
  }
  socket.destroy()
  process.exit(fail ? 1 : 0)
})()
