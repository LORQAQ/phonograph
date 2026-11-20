'use strict'
/* 前端：删掉已成死代码的 writable===false 分支，错误提示给真实原因 */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

const p = 'public/app.js'
let s = fs.readFileSync(p, 'utf8')
let n = 0

/* 两处 writable===false 分支 */
const oldA = `        if (r && r.writable === false) toast('已设为：' + r.dir + '（当前进程写不进去，重启程序后一般正常）', 4200)
        else toast('下载目录已设为：' + r.dir, 2600)`
const newA = `        /* 服务端新增：目录建不出来/不可写时会直接返回 400，
           所以走到这里就是真的成功了，不再需要 writable 判断 */
        toast('下载目录已设为：' + r.dir, 2600)`

if (s.includes(oldA)) { s = s.replace(oldA, () => newA); n++ }

const oldB = `        if (r && r.writable === false) toast('已设为：' + dir + '（当前进程写不进去，重启程序后一般正常）', 4200)
        else toast('下载目录已设为：' + dir, 3000)`
const newB = `        toast('下载目录已设为：' + dir, 3000)`

if (s.includes(oldB)) { s = s.replace(oldB, () => newB); n++ }

/* 错误提示：区分「目录问题」和「网络/程序问题」 */
const oldC = `      } catch (e) { toast('设置失败：' + e.message, 2600) }
    }`
const newC = `      } catch (e) {
        /* 目录不可用是用户输入问题，不是程序故障，措辞要说清楚 */
        const m = String(e.message || e)
        if (/目录|EPERM|EACCES|ENOENT|EEXIST|不可写/.test(m)) toast('目录不可用：' + m, 4200)
        else toast('设置失败：' + m, 3200)
      }
    }`
if (s.includes(oldC)) { s = s.replace(oldC, () => newC); n++ }

fs.writeFileSync(p, s, 'utf8')
console.log('✓ 改了 ' + n + ' 处')
console.log('  writable===false 残留:', s.includes('writable === false') ? '✗ 还有' : '✓ 已清')
console.log('  重启程序后一般正常 残留:', s.includes('重启程序后一般正常') ? '✗ 还有' : '✓ 已清')
