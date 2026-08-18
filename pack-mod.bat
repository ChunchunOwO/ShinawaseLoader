@echo off
setlocal

set "NODE=node"
if not exist "%NODE%" set "NODE=node"
"%NODE%" "%~dp0scripts\pack-echomod.mjs" "%~f1" "%~2"

echo.
pause

