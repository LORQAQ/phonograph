'use strict'
/* 设置页：下载目录改成「选择」按钮（调用桌面壳的文件夹选择框） */
const fs = require('node:fs')
const p = 'public/app.js'
let s = fs.readFileSync(p, 'utf8')

/* 1) 按钮：把「保存」换成「选择目录」 */
const oldBtn = '<button class="btn-mini" id="dlDirOpen">打开</button>'
const newBtn = '<button class="btn-mini" id="dlDirPick">选择</button>\n          <button class="btn-mini" id="dlDirOpen">打开</button>'
if (s.includes(oldBtn) && !s.includes('dlDirPick')) {
  s = s.replace(oldBtn, newBtn)
}

/* 2) 绑定：调用 C# 壳的 pickDir，并监听回传 */
if (!s.includes("postMessage('pickDir')") && !s.includes('postMessage("pickDir")')) {
  const anchor = "    $('#dlDirOpen').onclick = () => { api('/api/download-dir?open=1').catch(() => {}) }"
  const block = `    $('#dlDirOpen').onclick = () => { api('/api/download-dir?open=1').catch(() => {}) }

    /* 选择目录：桌面壳弹系统文件夹选择框；浏览器里退回 $showDirectoryPicker$ */
    if ($('#dlDirPick')) {
      $('#dlDirPick').onclick = async () => {
        try {
          if (window.chrome && window.chrome.webview && window.chrome.webview.postMessage) {
            window.chrome.webview.postMessage('pickDir')
            toast('请在弹窗里选择下载目录…', 4000)
            return
          }
          /* 浏览器环境：只能用 File System Access API，拿不到真实路径则提示手填 */
          if (window.showDirectoryPicker) {
            const handle = await window.showDirectoryPicker()
            toast('浏览器无法获取真实路径，请手动填写：当前选择 ' + (handle && handle.name), 5000)
            return
          }
          toast('当前环境不支持目录选择，请手动填写路径', 3000)
        } catch (e) { }
      }
    }
    if (window.chrome && window.chrome.webview && window.chrome.webview.addEventListener) {
      window.chrome.webview.addEventListener('message', (ev) => {
        const data = String(ev.data || '')
        if (!data.startsWith('dirPicked:')) return
        const dir = data.slice('dirPicked:'.length)
        const inp = $('#dlDir')
        if (inp) inp.value = dir
        api('/api/download-dir?set=' + encodeURIComponent(dir)).then(() => {
          toast('下载目录已设为：' + dir, 3000)
        }).catch((e) => toast('设置失败：' + e.message, 3000))
      })
    }`
  if (s.includes(anchor)) {
    s = s.replace(anchor, block)
    console.log('目录选择已绑定')
  } else {
    console.log('未找到绑定位置')
  }
}

fs.writeFileSync(p, s, 'utf8')
console.log('按钮:', s.includes('dlDirPick'))
console.log('绑定:', s.includes('postMessage(\'pickDir\')'))
