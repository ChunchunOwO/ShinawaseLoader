@echo off
setlocal
title ShinawaseLoader - Dev with latest mods
cd /d "%~dp0"
chcp 65001 >nul

rem Pack/import mods, quit ECHO, launch ECHO.modded.exe (asar-bridge).
rem Stock Steam ECHO.exe ignores --inspect, so accounts need the modded runtime.
rem Options: -Watch  -NoLaunch  -KeepRunning  -EchoRoot "D:\path\to\ECHO"
rem Do not start ECHO from Steam when using the accounts bridge.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\dev-with-latest-mods.ps1" %*
set "ERR=%ERRORLEVEL%"

if "%ERR%"=="0" goto OK
echo.
echo Failed with exit code %ERR%.
if "%ERR%"=="2" echo Desktop bridge did not come up. Fully quit ECHO and run this bat again. Do not use Steam Start.
pause
exit /b %ERR%

:OK
echo.%* | find /I "-Watch" >nul
if not errorlevel 1 exit /b 0
echo.
pause
exit /b 0