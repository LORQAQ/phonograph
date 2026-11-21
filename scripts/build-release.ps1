# One-shot build. MUST run from pwsh: csc spawned from Node is denied write access
# in this sandbox, so the compile steps have to be direct children of powershell.
#
# ASCII only on purpose: PowerShell 5.1 reads .ps1 as ANSI, any non-ASCII char
# inside the file gets mangled and breaks string terminators.
#
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\build-release.ps1
$ErrorActionPreference = "Continue"
$base = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $base

$node = ".\runtime\node.exe"
$script:fail = 0

function Step($name, $block) {
    Write-Host ""
    Write-Host "=== $name ==="
    $global:LASTEXITCODE = 0
    & $block
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  !! FAILED (exit $LASTEXITCODE)"
        $script:fail++
    }
}

Write-Host "=== version ==="
$appJs = Get-Content "public\app.js" -Raw
if ($appJs -match "APP_VERSION = '([^']+)'") {
    Write-Host "  $($Matches[1])"
} else {
    Write-Host "  ERR cannot read APP_VERSION"
    exit 1
}

Step "assemble + APK" { & $node scripts\build-all.cjs --apk }
Step "shell: prepare" { & $node scripts\build-shell.cjs prepare }
Step "shell: compile" { & powershell -NoProfile -ExecutionPolicy Bypass -File scripts\build-shell.ps1 }
Step "shell: finalize" { & $node scripts\build-shell.cjs finalize }
Step "payload + zip" { & $node scripts\build-all.cjs --exe }
Step "installer: compile" { & powershell -NoProfile -ExecutionPolicy Bypass -File scripts\build-installer.ps1 }
Step "installer: finalize" { & $node scripts\finalize-installer.cjs }
Step "verify APK" { & $node scripts\verify-apk-archived.cjs }
Step "verify installer" { & $node scripts\verify-installer.cjs }
Step "verify packaged" { & $node scripts\verify-packaged-posts.cjs }

Write-Host ""
Write-Host "================ result ================"
if ($script:fail -gt 0) {
    Write-Host "!! $($script:fail) step(s) failed"
    exit 1
}
Write-Host "all good"
Write-Host "--- artifacts ---"
Get-ChildItem -File | Where-Object { $_.Extension -eq ".exe" -or $_.Extension -eq ".apk" } | ForEach-Object {
    $mb = [math]::Round($_.Length / 1MB, 2)
    Write-Host ("  " + $_.Name + "  " + $mb + " MB")
}
exit 0