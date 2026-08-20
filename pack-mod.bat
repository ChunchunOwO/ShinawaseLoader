@echo off
setlocal

set "NODE=%~dp0ShinawaseLoader\node.exe"
if not exist "%NODE%" set "NODE=node"
"%NODE%" "%~dp0scripts\pack-echomod.mjs" "%~f1" "%~2" %~3 %~4 %~5 %~6 %~7 %~8 %~9

echo.
pause
