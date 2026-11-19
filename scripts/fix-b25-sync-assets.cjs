'use strict'
/* B25: build-apk.ps1 里加「同步 mobile/www → app/assets/www」这一步 */
const fs = require('node:fs')
const p = 'apk-build/build-apk.ps1'
let s = fs.readFileSync(p, 'utf8')

if (s.includes('4.5/7 sync assets')) {
  console.log('已有同步步骤')
  process.exit(0)
}

const anchor = 'Write-Host "5/7 add dex + assets"'
if (!s.includes(anchor)) {
  console.log('未找到锚点')
  process.exit(1)
}

const syncBlock = `# 4.5/7 sync assets/www  —— BUG-REPORT-2 B25
# 之前完全靠手工把 mobile/www 复制到 app/assets/www，改了前端忘记复制就会打出旧包
Write-Host "4.5/7 sync assets/www"
$wwwSrc = Join-Path (Split-Path $base -Parent) "lx-music-clone\\mobile\\www"
if (-not (Test-Path $wwwSrc)) { throw "mobile/www 不存在：$wwwSrc" }
$wwwDst = Join-Path $base "app\\assets\\www"
Remove-Item $wwwDst -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $wwwDst -Force | Out-Null
Copy-Item (Join-Path $wwwSrc "*") $wwwDst -Recurse -Force
$need = @('index.html', 'app.js', 'style.css', 'api-mobile.js', 'sources-data.js',
          'lib\\native-http.js', 'lib\\music-libs.js', 'lib\\lx-engine-web.js',
          'lib\\vendor\\crypto-js.min.js', 'lib\\vendor\\pako.min.js', 'lib\\vendor\\jsencrypt.min.js')
foreach ($f in $need) {
    if (-not (Test-Path (Join-Path $wwwDst $f))) { throw "assets/www 缺少关键文件：$f" }
}
$cnt = (Get-ChildItem $wwwDst -Recurse -File | Measure-Object).Count
Write-Host "      synced $cnt files"

`

s = s.replace(anchor, syncBlock + anchor)
fs.writeFileSync(p, s, 'utf8')
console.log('✓ build-apk.ps1 已加 4.5/7 同步步骤')
