@echo off
setlocal
title ShinawaseLoader - Setup
if /i "%~1"=="--gpui" goto gpui
cd /d "%~dp0"
rem No arguments: open the Shinawase Manager GUI. Any argument (for example
rem -Action install -EchoRoot "...") keeps the PowerShell CLI installer.
if not "%~1"=="" goto cli
if exist "%~dp0ShinawaseManager.exe" (
  start "" "%~dp0ShinawaseManager.exe" --source "%~dp0ShinawaseLoader"
  exit /b 0
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build-manager.ps1" -Launch >nul
if not errorlevel 1 exit /b 0
echo Shinawase Manager could not be started; falling back to the console installer.
:cli
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup-modloader.ps1" %*
if errorlevel 1 (
  pause
  exit /b 1
)
exit 0

:gpui
set "GPUI_NODE=node"
if exist "%~dp0ShinawaseLoader\node.exe" set "GPUI_NODE=%~dp0ShinawaseLoader\node.exe"
if defined ECHO_NODE_PATH set "GPUI_NODE=%ECHO_NODE_PATH%"
"%GPUI_NODE%" "%~dp0ShinawaseLoader\ShinawaseLoader.mjs" %*
exit /b %errorlevel%
