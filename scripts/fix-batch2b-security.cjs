'use strict'
/* 第 2 批剩余安全修复：B9 TrustAll / B10 WebView 调试 / B27 密钥库 */
const fs = require('node:fs')
const done = []
const miss = []

/* ============ B10: WebView 调试只在 debuggable 时开 ============ */
{
  const p = 'apk-build/app/src/com/phonograph/player/MainActivity.java'
  let s = fs.readFileSync(p, 'utf8')

  const old = `        if (Build.VERSION.SDK_INT >= 19) WebView.setWebContentsDebuggingEnabled(true);`
  if (s.includes(old)) {
    s = s.replace(old, `        /* B10: 只在 debuggable 构建里开远程调试，release 包不能让人 chrome://inspect */
        boolean isDebuggable = (getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        if (Build.VERSION.SDK_INT >= 19) WebView.setWebContentsDebuggingEnabled(isDebuggable);`)
    done.push('B10 WebView 调试按 debuggable 开关')
  } else {
    /* 找变体 */
    const i = s.indexOf('setWebContentsDebuggingEnabled')
    if (i > 0) {
      const ls = s.lastIndexOf('\n', i) + 1
      const le = s.indexOf('\n', i)
      const line = s.slice(ls, le)
      s = s.slice(0, ls) + `        boolean isDebuggable = (getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0;\n        if (Build.VERSION.SDK_INT >= 19) WebView.setWebContentsDebuggingEnabled(isDebuggable);` + s.slice(le)
      done.push('B10 WebView 调试（宽松替换）')
    } else {
      miss.push('B10 setWebContentsDebuggingEnabled')
    }
  }

  /* 顺带把 file 访问关掉（页面走 shouldInterceptRequest 的 assets 虚拟域，不需要 file://） */
  const fileOld = `        s.setAllowFileAccessFromFileURLs(true);`
  if (s.includes(fileOld)) {
    s = s.replace(fileOld, `        /* B10: 关掉 file:// 跨源权限，页面走 appassets 虚拟域 */
        s.setAllowFileAccessFromFileURLs(false);`)
    done.push('B10 关 file:// 跨源')
  }
  const uniOld = `        s.setAllowUniversalAccessFromFileURLs(true);`
  if (s.includes(uniOld)) {
    s = s.replace(uniOld, `        s.setAllowUniversalAccessFromFileURLs(false);`)
    done.push('B10 关 universal file access')
  }
  const mixedOld = `        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);`
  if (s.includes(mixedOld)) {
    s = s.replace(mixedOld, `        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);`)
    done.push('B10 mixed content 改 COMPATIBILITY')
  }

  fs.writeFileSync(p, s, 'utf8')
}

/* ============ B9: NapiBridge 里写死的 insecure=true 改成读 opts ============ */
{
  const p = 'apk-build/app/src/com/phonograph/player/NapiBridge.java'
  let s = fs.readFileSync(p, 'utf8')

  /* probe 里的 openConnection(url, true) */
  const t1 = 'openConnection(url, true)'
  const n1 = (s.match(/openConnection\(url,\s*true\)/g) || []).length
  if (n1 > 0) {
    s = s.split('openConnection(url, true)').join('openConnection(url, false)')
    done.push('B9 openConnection(url,true) × ' + n1 + ' → false')
  }

  /* 其他 insecure 变量默认值 */
  const t2 = 'boolean insecure = true'
  if (s.includes(t2)) {
    s = s.replace(/boolean insecure = true/g, 'boolean insecure = false')
    done.push('B9 insecure 默认值 → false')
  }

  fs.writeFileSync(p, s, 'utf8')
}

/* ============ B27: 密钥库移出仓库 ============ */
{
  const p = 'apk-build/build-apk.ps1'
  let s = fs.readFileSync(p, 'utf8')

  const oldKs = `$ks = "$base\\phonograph.keystore"`
  if (s.includes(oldKs)) {
    s = s.replace(oldKs, `# B27: 密钥库放在仓库外，口令走环境变量；缺失时直接报错，绝不静默重新生成
$ks = Join-Path $env:USERPROFILE ".phonograph\\phonograph.keystore"`)
    done.push('B27 密钥库路径移到 ~/.phonograph')
  }

  /* 自动生成那段改成「缺失就 throw」 */
  const genOld = /if \(-not \(Test-Path \$ks\)\) \{[\s\S]*?keytool\.exe"?[^\n]*\n\}/m
  if (genOld.test(s)) {
    s = s.replace(genOld, `if (-not (Test-Path $ks)) {
    throw "签名密钥库缺失：$ks（请从备份恢复，禁止重新生成——会导致已安装用户无法升级）"
}`)
    done.push('B27 缺失时 throw 而不是重新生成')
  }

  /* 口令走环境变量 */
  const passOld = `--storepass phonograph --keypass phonograph`
  if (s.includes(passOld)) {
    s = s.replace(passOld, `--storepass "$env:PHONOGRAPH_KS_PASS" --keypass "$env:PHONOGRAPH_KS_PASS"`)
    done.push('B27 口令走环境变量')
  }
  const passOld2 = `--ks-pass pass:phonograph --key-pass pass:phonograph`
  if (s.includes(passOld2)) {
    s = s.replace(passOld2, `--ks-pass "env:PHONOGRAPH_KS_PASS" --key-pass "env:PHONOGRAPH_KS_PASS"`)
    done.push('B27 apksigner 口令走 env')
  }

  fs.writeFileSync(p, s, 'utf8')
}

/* ============ .gitignore 排除密钥库 ============ */
{
  const p = '.gitignore'
  let s = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''
  if (!s.includes('*.keystore')) {
    s += '\n# B27: 签名密钥库不能入库\n*.keystore\n*.jks\n*.apk\n*.exe\n'
    fs.writeFileSync(p, s, 'utf8')
    done.push('.gitignore 排除密钥库')
  }
}

console.log('=== 已完成 ===')
done.forEach((d) => console.log('  ✓ ' + d))
if (miss.length) {
  console.log('=== 未匹配 ===')
  miss.forEach((m) => console.log('  ⚠ ' + m))
}
