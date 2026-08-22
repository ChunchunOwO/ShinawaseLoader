@echo off
setlocal
title ShinawaseLoader - Setup
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup-modloader.ps1" %*
if errorlevel 1 (
  pause
  exit /b 1
)
exit 0
