'use strict'
/* 用 GitHub API 逐个文件更新（git push 网络超时的兜底方案） */
const https = require('node:https')
const fs = require('node:fs')
const path = require('node:path')

const TOKEN = process.env.GITHUB_TOKEN || ''
const OWNER = 'LORQAQ'
const REPO = 'phonograph'
const BRANCH = 'main'

if (!TOKEN) { console.log('缺少 GITHUB_TOKEN'); process.exit(1) }

function api (method, p, body) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body), 'utf8') : null
    const req = https.request({
      hostname: 'api.github.com',
      path: p,
      method,
      headers: Object.assign({
        'User-Agent': 'phonograph',
        Authorization: 'token ' + TOKEN,
        Accept: 'application/vnd.github+json',
      }, data ? { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': data.length } : {}),
      timeout: 60000,
    }, (res) => {
      let d = ''
      res.on('data', (c) => { d += c })
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }) } catch (e) { resolve({ status: res.statusCode, body: d }) }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
    if (data) req.write(data)
    req.end()
  })
}

/* 要更新的文件 */
const files = [
  'app/server.js',
  'public/app.js',
  'mobile/www/api-mobile.js',
  'mobile/www/lib/lx-engine-web.js',
  'scripts/fix-desktop-bugs.cjs',
  'scripts/fix-desktop-bugs2.cjs',
  'scripts/fix-desktop-bugs3.cjs',
  'scripts/fix-b5.cjs',
  'scripts/verify-v6.cjs',
  'scripts/verify-mobile-fixes.cjs',
  'scripts/fix-mobile-bugs.cjs',
  'scripts/final-check.cjs',
]

;(async () => {
  /* 1. 拿当前分支的 HEAD */
  console.log('=== 获取当前 HEAD ===')
  const ref = await api('GET', '/repos/' + OWNER + '/' + REPO + '/git/ref/heads/' + BRANCH)
  if (ref.status !== 200) { console.log('获取 ref 失败: ' + ref.status); return }
  const baseCommit = ref.body.object.sha
  console.log('  基准提交: ' + baseCommit.slice(0, 7))

  const base = await api('GET', '/repos/' + OWNER + '/' + REPO + '/git/commits/' + baseCommit)
  const baseTree = base.body.tree.sha
  console.log('  基准树: ' + baseTree.slice(0, 7))

  /* 2. 逐个上传 blob */
  console.log('\n=== 上传文件 ===')
  const treeItems = []
  for (const f of files) {
    if (!fs.existsSync(f)) { console.log('  跳过（本地不存在）: ' + f); continue }
    const content = fs.readFileSync(f, 'utf8')
    const blob = await api('POST', '/repos/' + OWNER + '/' + REPO + '/git/blobs', {
      content,
      encoding: 'utf-8',
    })
    if (blob.status === 201) {
      treeItems.push({ path: f, mode: '100644', type: 'blob', sha: blob.body.sha })
      console.log('  ✓ ' + f + ' (' + (content.length / 1024).toFixed(1) + ' KB)')
    } else {
      console.log('  ✗ ' + f + ' status=' + blob.status)
    }
  }

  if (!treeItems.length) { console.log('没有文件需要上传'); return }

  /* 3. 创建新树 */
  console.log('\n=== 创建树 ===')
  const tree = await api('POST', '/repos/' + OWNER + '/' + REPO + '/git/trees', {
    base_tree: baseTree,
    tree: treeItems,
  })
  if (tree.status !== 201) { console.log('创建树失败: ' + tree.status + ' ' + JSON.stringify(tree.body).slice(0, 200)); return }
  console.log('  新树: ' + tree.body.sha.slice(0, 7))

  /* 4. 创建提交 */
  console.log('\n=== 创建提交 ===')
  const commitMsg = [
    'fix: 桌面端按 BUG-REPORT 修复 P0/P1',
    '',
    'B3 切歌竞态：streamSrc 异步返回时校验 token',
    'B4 取流失败赋空 src：改走 removeAttribute',
    'B5 关闭丢失最后修改：shutdown 前 clearTimeout + 同步落盘',
    'B6 db 非原子写：先写 .tmp 再 rename；解析失败备份 .bak',
    'B10 下载列表删不掉：遍历候选目录 + path.relative 校验 + 扩展名白名单',
    'B23 歌单去重：键改为 source + id',
    'S1 零鉴权：默认绑 127.0.0.1，局域网需 PHONOGRAPH_LAN=1',
    'S4 静态路径：startsWith 改 path.relative',
  ].join('\n')

  const commit = await api('POST', '/repos/' + OWNER + '/' + REPO + '/git/commits', {
    message: commitMsg,
    tree: tree.body.sha,
    parents: [baseCommit],
  })
  if (commit.status !== 201) { console.log('创建提交失败: ' + commit.status + ' ' + JSON.stringify(commit.body).slice(0, 200)); return }
  console.log('  新提交: ' + commit.body.sha.slice(0, 7))

  /* 5. 更新分支引用 */
  console.log('\n=== 更新分支 ===')
  const upd = await api('PATCH', '/repos/' + OWNER + '/' + REPO + '/git/refs/heads/' + BRANCH, {
    sha: commit.body.sha,
    force: false,
  })
  if (upd.status === 200) {
    console.log('  ✓ 分支已更新: ' + upd.body.object.sha.slice(0, 7))
  } else {
    console.log('  ✗ 失败 status=' + upd.status + ' ' + JSON.stringify(upd.body).slice(0, 200))
  }

  /* 6. 本地仓库同步（让 git log 一致） */
  console.log('\n完成。远程提交: ' + commit.body.sha.slice(0, 7))
})()
