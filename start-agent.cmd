@echo off
REM Start the Timetable Agent - http://localhost:3001
REM Double-click from the repo root, or run: .\start-agent.cmd
REM Leave start-backend.cmd running in another window.
setlocal
cd /d "%~dp0"

REM Keep the window open when double-clicked.
if /i not "%~1"=="_KEEPOPEN" (
  echo.%CMDCMDLINE% | find /I "/c" >nul
  if not errorlevel 1 (
    cmd /k "%~f0" _KEEPOPEN
    exit /b %ERRORLEVEL%
  )
)

if not exist "%~dp0chat-agent\.env" (
  echo [info] Creating empty chat-agent\.env
  type nul > "%~dp0chat-agent\.env"
)

if not exist "%~dp0chat-agent\node_modules" (
  echo [error] chat-agent is not installed yet.
  echo Run install.cmd from this folder first.
  goto :fail
)

echo.
echo === AITTO Timetable Agent ===
echo Listening on http://localhost:3001 when ready
echo Leave start-backend.cmd running in another window.
echo Press Ctrl+C to stop.
echo.
cd /d "%~dp0chat-agent"
node --env-file=.env ./node_modules/tsx/dist/cli.mjs watch src/server.ts
set "EXIT_CODE=%ERRORLEVEL%"
echo.
if not "%EXIT_CODE%"=="0" goto :fail
if /i "%~1"=="_KEEPOPEN" (
  echo Press any key to close this window...
  pause >nul
)
exit /b 0

:fail
echo.
echo Agent failed to start. Run install.cmd, then try again.
echo.
if /i "%~1"=="_KEEPOPEN" (
  echo Press any key to close this window...
  pause >nul
)
exit /b 1
