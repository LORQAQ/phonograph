$root = Split-Path $PSScriptRoot -Parent
$exe = Join-Path $root "LXMusic.exe"
$ico = Join-Path $root "LXMusic.ico"
$desktop = [Environment]::GetFolderPath('Desktop')

$ws = New-Object -ComObject WScript.Shell
$lnkPath = Join-Path $desktop "LX Music.lnk"
$lnk = $ws.CreateShortcut($lnkPath)
$lnk.TargetPath = $exe
$lnk.WorkingDirectory = $root
if (Test-Path $ico) { $lnk.IconLocation = $ico }
$lnk.Description = "LX Music · 本地音乐播放器"
$lnk.Save()

# 开始菜单快捷方式
$startDir = Join-Path ([Environment]::GetFolderPath('Programs')) "LX Music"
if (-not (Test-Path $startDir)) { New-Item -ItemType Directory -Path $startDir | Out-Null }
$lnk2 = $ws.CreateShortcut((Join-Path $startDir "LX Music.lnk"))
$lnk2.TargetPath = $exe
$lnk2.WorkingDirectory = $root
if (Test-Path $ico) { $lnk2.IconLocation = $ico }
$lnk2.Description = "LX Music · 本地音乐播放器"
$lnk2.Save()

Write-Output "已创建快捷方式："
Write-Output ("  桌面: " + $lnkPath)
Write-Output ("  开始菜单: " + (Join-Path $startDir "LX Music.lnk"))
