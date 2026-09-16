@echo off
setlocal

set "NODE=%~dp0ShinawaseLoader\node.exe"
if not exist "%NODE%" set "NODE=node"
"%NODE%" "%~dp0ShinawaseLoader\testing\cli.mjs" %*

echo.
pause
