# Build 留声.exe (WinForms + WebView2 shell) -- ASCII only on purpose
# PowerShell 5.1 reads .ps1 as ANSI; non-ASCII inside this file gets mangled.
#
# Usage: node scripts\build-shell.cjs   (it calls this script and renames the output)
$ErrorActionPreference = "Stop"
$base = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $base

$csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $csc)) { Write-Host "ERR missing csc"; exit 1 }
if (-not (Test-Path "scripts\NativeShell.cs")) { Write-Host "ERR missing NativeShell.cs"; exit 1 }

$tmpOut = "build\_shell_compile.exe"
if (Test-Path $tmpOut) { Remove-Item $tmpOut -Force -ErrorAction SilentlyContinue }

& $csc /nologo /target:winexe "/out:$tmpOut" /win32icon:LXMusic.ico `
    "/resource:LXMusic.ico,LXMusic.ico" `
    "build\_AssemblyInfo.cs" `
    /r:System.dll /r:System.Windows.Forms.dll /r:System.Drawing.dll `
    /r:Microsoft.Web.WebView2.Core.dll /r:Microsoft.Web.WebView2.WinForms.dll `
    "scripts\NativeShell.cs" 2>&1 | ForEach-Object { Write-Host $_ }

if (-not (Test-Path $tmpOut)) { Write-Host "ERR compile failed"; exit 1 }

$kb = [math]::Round((Get-Item $tmpOut).Length / 1KB, 1)
Write-Host "OK compiled $kb KB"
exit 0