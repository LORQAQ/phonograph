@echo off
chcp 65001 >nul
title LX Music 调试启动
cd /d "%~dp0"
echo ===========================================
echo   LX Music 调试模式（关闭本窗口即停止服务）
echo ===========================================
echo.
start "" /b ""%~dp0runtime\node.exe"" "%~dp0app\server.js"
timeout /t 3 >nul
start "" "http://127.0.0.1:37621/"
echo 已打开浏览器，按任意键关闭服务并退�?..
pause >nul
taskkill /f /im node.exe >nul 2>&1
