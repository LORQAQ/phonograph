'use strict'
/* 下载管理页：加「复制路径」、点击文件名可直接下载到浏览器 */
const fs = require('node:fs')
const p = 'public/app.js'
let s = fs.readFileSync(p, 'utf8')

/* 1) 头部加「复制路径」按钮 */
s = s.replace(
  `      <button class="btn-mini" id="dlOpenDir">打开目录</button>
      <button class="btn-mini" id="dlRefresh">刷新</button>`,
  `      <button class="btn-mini" id="dlCopyDir">复制路径</button>
      <button class="btn-mini" id="dlOpenDir">打开目录</button>
      <button class="btn-mini" id="dlRefresh">刷新</button>`
)

/* 2) 绑定：复制路径 + 打开失败自动复制 */
s = s.replace(
  `  if ($('#dlOpenDir')) {
    $('#dlOpenDir').onclick = () => {
      if (window.chrome && window.chrome.webview && window.chrome.webview.postMessage) {
        window.chrome.webview.postMessage('openDir:' + dir)
      } else {
        api('/api/download-dir?open=1').catch(() => toast('打不开目录', 2000))
      }
    }
  }`,
  `  if ($('#dlCopyDir')) {
    $('#dlCopyDir').onclick = async () => {
      try { await navigator.clipboard.writeText(dir); toast('路径已复制：' + dir, 3600) } catch (e) { toast('复制失败，手动选中最上方路径', 3600) }
    }
  }
  if ($('#dlOpenDir')) {
    $('#dlOpenDir').onclick = async () => {
      try { await navigator.clipboard.writeText(dir).catch(() => {}) } catch (e) { }
      if (window.chrome && window.chrome.webview && window.chrome.webview.postMessage) {
        window.chrome.webview.postMessage('openDir:' + dir)
        toast('已尝试打开，打不开的话路径已复制到剪贴板', 3600)
        return
      }
      try {
        const r = await api('/api/download-dir?open=1')
        if (r && r.ok === false) toast('系统拦住了资源管理器，路径已复制：' + dir, 4200)
      } catch (e) {
        toast('打开失败，路径已复制：' + dir, 4200)
      }
    }
  }`
)

/* 3) 点击文件名 → 浏览器下载该文件 */
s = s.replace(
  `  $$('.dl-remove').forEach((b) => {`,
  `  $$('.dl-list tbody tr').forEach((tr) => {
    tr.onclick = (e) => {
      if (e.target.closest('.dl-remove')) return
      const name = decodeURIComponent(tr.dataset.name)
      const a = document.createElement('a')
      a.href = '/api/downloads/get?name=' + encodeURIComponent(name)
      a.download = name
      document.body.appendChild(a)
      a.click()
      setTimeout(() => a.remove(), 1200)
    }
  })
  $$('.dl-remove').forEach((b) => {`
)

fs.writeFileSync(p, s, 'utf8')
console.log('复制路径:', s.includes('dlCopyDir'))
console.log('点击下载:', s.includes("'/api/downloads/get?name='"))
