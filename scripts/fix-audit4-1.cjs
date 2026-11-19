'use strict'
/* 第四轮修复：lastGoodQuality 初始化 + renderList 残留 + gcid in-flight */
const path = require('node:path')
process.chdir(path.resolve(__dirname, '..'))
const fs = require('node:fs')
const done = []
const miss = []

/* ============ 1. state.lastGoodQuality 初始化 ============ */
{
  const p = 'public/app.js'
  let s = fs.readFileSync(p, 'utf8')
  if (!/lastGoodQuality\s*:\s*/.test(s)) {
    /* 找 state 对象定义，加一个初始值 */
    const m = s.match(/const state = \{[\s\S]{0,400}?quality:\s*[^,\n]+,/)
    if (m) {
      s = s.replace(m[0], m[0] + '\n  lastGoodQuality: \'\',   /* 上一次取流成功的音质，切音质失败时回退用 */')
      done.push('lastGoodQuality 初始化')
    } else {
      /* 退而求其次：找 settings 里 quality 的默认值 */
      const m2 = s.match(/state\.quality\s*=\s*[^;\n]+/)
      if (m2) {
        const idx = s.indexOf(m2[0])
        const le = s.indexOf('\n', idx)
        s = s.slice(0, le + 1) + "state.lastGoodQuality = ''   /* 上一次成功的音质 */\n" + s.slice(le + 1)
        done.push('lastGoodQuality 初始化（插在 quality 赋值后）')
      } else {
        miss.push('state 定义')
      }
    }
  } else {
    done.push('lastGoodQuality 已初始化')
  }

  /* 回退时也要有兜底：如果 lastGoodQuality 为空，退回平台默认 */
  const old = `const prevQuality = prevQualityArg || state.lastGoodQuality || state.quality`
  if (s.includes(old)) {
    s = s.replace(old, `/* prevQualityArg 来自 onchange（已经先改了 state.quality）；
       lastGoodQuality 是上一次成功的值；都没有时用设置里的默认值 */
  const __fallbackQ = state.lastGoodQuality || (state.settings && state.settings.quality) || '320k'
  const prevQuality = prevQualityArg || __fallbackQ || state.quality`)
    done.push('音质回退三级兜底')
  }

  /* ============ 2. renderList 残留 ============ */
  const lines = s.split('\n')
  let fixed = 0
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('renderList &&') || (lines[i].includes('renderList()') && !lines[i].trim().startsWith('//') && !lines[i].trim().startsWith('/*'))) {
      lines[i] = lines[i].replace(/renderList && renderList\(\)/g, "state.view === 'downloads' && renderDownloadsView()")
      fixed++
    }
  }
  if (fixed > 0) {
    s = lines.join('\n')
    done.push('renderList 残留清理（' + fixed + ' 处）')
  }

  fs.writeFileSync(p, s, 'utf8')
}

/* ============ 3. kugou-gcid in-flight 合并 ============ */
{
  const p = 'app/lib/kugou-gcid.js'
  let s = fs.readFileSync(p, 'utf8')
  if (!s.includes('__gcidInflight')) {
    const anchor = '/**\n * 拉整张 gcid 歌单（自动翻页 + 按 hash 去重）'
    const helper = `/** 同一 gcid 的并发导入只打一次酷狗接口（用户连点两次不会触发限流） */
const __gcidInflight = new Map()

`
    if (s.includes(anchor)) {
      s = s.replace(anchor, helper + anchor)

      /* 在 fetchGcidPlaylist 开头加合并 */
      const fnOld = `async function fetchGcidPlaylist (gcid, opts = {}) {
  const maxSongs = opts.maxSongs || 2000`
      const fnNew = `async function fetchGcidPlaylist (gcid, opts = {}) {
  const key = String(gcid) + '|' + (opts.maxSongs || 2000)
  const existing = __gcidInflight.get(key)
  if (existing) return existing
  const job = __fetchGcidPlaylistInner(gcid, opts).finally(() => __gcidInflight.delete(key))
  __gcidInflight.set(key, job)
  return job
}

async function __fetchGcidPlaylistInner (gcid, opts = {}) {
  const maxSongs = opts.maxSongs || 2000`
      if (s.includes(fnOld)) {
        s = s.replace(fnOld, fnNew)
        done.push('gcid in-flight 合并')
      } else {
        miss.push('fetchGcidPlaylist 签名')
      }
    } else {
      miss.push('fetchGcidPlaylist 注释锚点')
    }
  } else {
    done.push('gcid in-flight 已存在')
  }
  fs.writeFileSync(p, s, 'utf8')
}

console.log('=== 已完成 ===')
done.forEach((d) => console.log('  ✓ ' + d))
if (miss.length) {
  console.log('=== 未匹配 ===')
  miss.forEach((m) => console.log('  ⚠ ' + m))
}
