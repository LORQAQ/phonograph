# Compile installer -> build\_setup_compile.exe  (ASCII only on purpose)
# PowerShell 5.1 reads .ps1 as ANSI; any non-ASCII char inside the file gets mangled.
# The Chinese output filename is applied afterwards by scripts\finalize-installer.cjs
#
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\build-installer.ps1
$ErrorActionPreference = "Stop"
$base = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $base

$zip = "build\payload_utf8.zip"
if (-not (Test-Path $zip)) {
    Write-Host "ERR missing $zip - run: node scripts\build-all.cjs --exe"
    exit 1
}
if (-not (Test-Path "scripts\Installer.cs")) {
    Write-Host "ERR missing scripts\Installer.cs"
    exit 1
}

$csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $csc)) {
    Write-Host "ERR missing csc: $csc"
    exit 1
}

$tmpOut = "build\_setup_compile.exe"
if (Test-Path $tmpOut) { Remove-Item $tmpOut -Force -ErrorAction SilentlyContinue }

& $csc /nologo /target:winexe "/out:$tmpOut" /win32icon:LXMusic.ico `
    /r:System.dll /r:System.Windows.Forms.dll /r:System.Drawing.dll `
    /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll `
    "/resource:$zip,payload.zip" `
    "scripts\Installer.cs" 2>&1 | ForEach-Object { Write-Host $_ }

if (-not (Test-Path $tmpOut)) {
    Write-Host "ERR compile failed"
    exit 1
}

$mb = [math]::Round((Get-Item $tmpOut).Length / 1MB, 2)
Write-Host "OK compiled $mb MB -> $tmpOut"
exit 0