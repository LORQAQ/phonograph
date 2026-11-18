'use strict'
/* 前端：下载改为后端直存 + 设置页加下载目录 */
const fs = require('node:fs')
let app = fs.readFileSync('public/app.js', 'utf8')

/* 1) 设置页加"下载目录"一行（放在下载格式后面） */
if (!app.includes('id="dlDir"')) {
  app = app.replace(
    `      <div class="form-row"><label>跟随封面取色</label><input id="setCoverTheme" type="checkbox" \${state.themeFromCover ? 'checked' : ''} /></div>`,
    `      <div class="form-row"><label>下载目录</label>
        <div style="display:flex;gap:8px;flex:1;min-width:0">
          <input id="dlDir" class="text-input" style="flex:1;min-width:0" placeholder="留空使用 音乐\\留声" />
          <button class="btn-mini" id="dlDirSave">保存</button>
          <button class="btn-mini" id="dlDirOpen">打开</button>
        </div></div>
      <div class="form-row"><label>跟随封面取色</label><input id="setCoverTheme" type="checkbox" \${state.themeFromCover ? 'checked' : ''} /></div>`
  )
}

/* 2) 绑定下载目录按钮 */
if (!app.includes("$('#dlDirSave')")) {
  app = app.replace(
    "  $$('.dl-fmt').forEach((b) => {",
    `  if ($('#dlDirSave')) {
    api('/api/download-dir').then((r) => {
      const inp = $('#dlDir')
      if (inp) inp.value = r.dir || ''
      if (inp) inp.placeholder = r.default || ''
    }).catch(() => {})
    $('#dlDirSave').onclick = async () => {
      const v = ($('#dlDir').value || '').trim()
      try {
        const r = await api('/api/download-dir?set=' + encodeURIComponent(v))
        $('#dlDir').value = r.dir
        toast('下载目录已设为：' + r.dir, 2600)
      } catch (e) { toast('设置失败：' + e.message, 2600) }
    }
    $('#dlDirOpen').onclick = () => { api('/api/download-dir?open=1').catch(() => {}) }
  }
  $$('.dl-fmt').forEach((b) => {`
  )
}

/* 3) 电脑端下载改为后端直存 */
const oldDl = app.indexOf('async function downloadSong (song) {')
if (oldDl > 0 && !app.includes('save=1')) {
  /* 找到函数体里 a.href 那段的写法，统一改成直存 */
  app = app.replace(
    "  state.downloading.add(key)\n  renderList()",
    "  state.downloading.add(key)\n  renderList()\n  /* 电脑端：后端直接写入下载目录，不弹浏览器另存为 */\n  if (!window.__MOBILE__) {\n    try {\n      const p = songParams(song)\n      p.set('save', '1')\n      const r = await api('/api/download?' + p.toString())\n      state.downloading.delete(key)\n      renderList()\n      const mb = (r.size / 1048576).toFixed(1)\n      toast('已保存 ' + mb + ' MB → ' + (r.name || ''), 3200)\n      return\n    } catch (e) {\n      state.downloading.delete(key)\n      renderList()\n      toast('下载失败：' + e.message, 3200)\n      return\n    }\n  }"
  )
}

fs.writeFileSync('public/app.js', app, 'utf8')
console.log('下载目录 UI:', app.includes('id="dlDir"'))
console.log('目录绑定:', app.includes("$('#dlDirSave')"))
console.log('直存:', app.includes("p.set('save', '1')"))
