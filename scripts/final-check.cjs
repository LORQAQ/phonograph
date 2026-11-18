'use strict'
/* 最终验证 GitHub 发布状态（token 从外部传入） */
const https = require('node:https')

const TOKEN = process.env.GH_TOKEN_FOR_CHECK || ''
if (!TOKEN) { console.log('缺少 token'); process.exit(1) }

function api (p) {
  return new Promise((resolve, reject) => {
    https.get({
      hostname: 'api.github.com',
      path: p,
      headers: { 'User-Agent': 'phonograph', Authorization: 'token ' + TOKEN, Accept: 'application/vnd.github+json' },
      timeout: 20000,
    }, (r) => {
      let d = ''
      r.on('data', (c) => { d += c })
      r.on('end', () => { try { resolve(JSON.parse(d)) } catch (e) { resolve(null) } })
    }).on('error', reject)
  })
}

;(async () => {
  const repo = await api('/repos/LORQAQ/phonograph')
  console.log('=== 仓库 ===')
  console.log('  ' + repo.full_name + ' | ' + (repo.description || ''))

  const rels = await api('/repos/LORQAQ/phonograph/releases')
  console.log('\n=== Release ===')
  if (Array.isArray(rels)) {
    rels.forEach((r) => console.log('  ' + r.tag_name.padEnd(8) + ' ' + r.name + ' | ' + r.assets.length + ' 附件'))
  } else {
    console.log('  查询失败')
  }

  const v5 = await api('/repos/LORQAQ/phonograph/releases/tags/v1.0.5')
  console.log('\n=== v1.0.5 内容 ===')
  if (v5 && v5.assets) {
    v5.assets.forEach((x) => console.log('  附件 ' + x.name + '  ' + (x.size / 1024).toFixed(0) + ' KB'))
    console.log('  说明 ' + (v5.body || '').length + ' 字符')
    console.log('  标题 ' + v5.name)
  }

  const commits = await api('/repos/LORQAQ/phonograph/commits?per_page=3')
  console.log('\n=== 最新提交 ===')
  if (Array.isArray(commits)) {
    commits.forEach((x) => console.log('  ' + x.sha.slice(0, 7) + ' ' + x.commit.message.split('\n')[0]))
  }
})()
