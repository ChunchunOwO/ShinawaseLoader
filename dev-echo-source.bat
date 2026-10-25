@echo off
setlocal
title ShinawaseLoader - ECHO source dev
set "REPO=%~dp0"
cd /d "%REPO%"
chcp 65001 >nul

rem Runs an ECHO source checkout's "npm run dev" with the Loader attached.
rem Usage: dev-echo-source.bat "<ECHOSTEAM_SOURCE>" [--full] [--debug]
rem Without a path, ECHOSTEAM_ROOT is used. Mods/Plugins come from this repository root
rem unless ECHO_GAME_ROOT / ECHO_MODS_HOME / ECHO_PLUGINS_HOME point elsewhere.

set "SOURCE_ARG="
if not "%~1"=="" if not "%~1"=="--full" if not "%~1"=="--debug" (
  set "SOURCE_ARG=--source "%~1""
  shift
)

node "%REPO%ShinawaseLoader\ShinawaseLoader.mjs" dev %SOURCE_ARG% %1 %2 %3 %4 %5 %6 %7 %8 %9
set "ERR=%ERRORLEVEL%"
if not "%ERR%"=="0" (
  echo.
  echo Failed with exit code %ERR%.
  pause
)
exit /b %ERR%
