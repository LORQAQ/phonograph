'use strict'
/**
 * 在 1.0.30 基础上，只做一件事：
 * 让「下载目录」不再因为写探测误报而被拒绝。
 *
 * 背景：1.0.30 的服务端对 /api/download-dir?set= 没有任何写探测，
 * 用户填 D:\音乐 能保存成功。我后来加的 mkdir+写探测把它变成了硬拦截，
 * 而 Node 在某些环境下对完全正常的目录也会在 open 时拿到 EPERM。
 *
 * 本次只改：
 *   1) mkdir 失败 → 仍然 400（真不可用）
 *   2) 同名文件存在（不是目录）→ 400
 *   3) 写探测失败 → 不阻止，只在响应里带 writable:false，前端不弹错误
 * 其它一律不动。
 */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

const done = []
const miss = []

/* ============ 服务端：/api/download-dir 的 set 分支 ============ */
{
  const f = 'app/server.js'
  let s = fs.readFileSync(f, 'utf8')

  /* 找 set 分支的判断行 */
  const anchor = `    if (set && set.trim()) {
      const dir = set.trim()`
  if (s.includes(anchor)) {
    const neu = `    if (set && set.trim()) {
      const dir = set.trim()
      /* 只拦「真的用不了」的情况：建不出来、或同名文件占位。
         写探测会误报（杀软/受控文件夹/权限策略都会让 open 拿到 EPERM），
         不能拿它阻止保存 —— 真实下载走的是另一条路径。 */
      let mkErr = ''
      try {
        fs.mkdirSync(dir, { recursive: true })
        if (!fs.statSync(dir).isDirectory()) mkErr = '该路径已存在且不是文件夹'
      } catch (e) {
        mkErr = String((e && e.message) || e).replace(/^[A-Z]+:\\s*/, '')
      }
      if (mkErr) throw Object.assign(new Error('目录无法使用：' + mkErr), { code: 400 })
      db.settings.downloadDir = dir
      saveDb()
      return { dir, writable: true, default: defaultDownloadDir() }`
    s = s.replace(anchor, () => neu)
    fs.writeFileSync(f, s, 'utf8')
    done.push('服务端 download-dir：只拦建不出来的，写探测不再阻止')
  } else {
    miss.push('服务端 set 分支锚点')
  }
}

/* ============ 前端：保存失败的提示措辞 ============ */
{
  const f = 'public/app.js'
  let s = fs.readFileSync(f, 'utf8')
  /* 1.0.30 里保存成功的 toast 是「下载目录已设为」，保持不动。
     只把 catch 里的错误措辞改清楚（区分目录问题和其它）。 */
  const a = `      } catch (e) { toast('设置失败：' + e.message, 2600) }`
  if (s.includes(a)) {
    s = s.replace(a, () => `      } catch (e) {
        const m = String((e && e.message) || e)
        if (/目录/.test(m)) toast(m, 4200)
        else toast('设置失败：' + m, 3200)
      }`)
    fs.writeFileSync(f, s, 'utf8')
    done.push('前端：目录错误提示')
  } else {
    miss.push('前端 catch 锚点')
  }
}

console.log('=== 结果 ===')
done.forEach((d) => console.log('  ✓ ' + d))
if (miss.length) { console.log('未改:'); miss.forEach((m) => console.log('  ⚠ ' + m)) }