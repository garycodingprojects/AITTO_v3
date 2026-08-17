@echo off
REM Start Quarkus dev mode (uses mvn.cmd on Windows).
REM -Ddebug=false disables the JDWP agent on port 5005, which otherwise prints
REM "Debugger failed to attach" warnings whenever an HTTP client hits port 5005.
setlocal EnableDelayedExpansion
cd /d "%~dp0"

REM When double-clicked, Windows uses "cmd /c" and the window closes on exit.
REM Re-launch with cmd /k so messages stay visible. Skip when already kept open,
REM or when run from an existing terminal (no /c in CMDCMDLINE).
if /i not "%~1"=="_KEEPOPEN" (
  echo.%CMDCMDLINE% | find /I "/c" >nul
  if not errorlevel 1 (
    cmd /k "%~f0" _KEEPOPEN
    exit /b %ERRORLEVEL%
  )
)

echo.
echo === AITTO Timetable Backend (Quarkus dev mode) ===
echo Folder: %CD%
echo.

REM --- Check Java ---
where java >nul 2>&1
if errorlevel 1 (
  echo [error] Java not found on PATH.
  echo Install Java JDK 17 or newer, then open a NEW terminal.
  echo   winget install Microsoft.OpenJDK.21 --accept-package-agreements --accept-source-agreements
  echo Then run install.cmd from the repo root.
  goto :fail
)

REM --- Resolve Maven (same locations as install.cmd) ---
if not defined MVN_CMD if exist "C:\maven\apache-maven-3.9.9\bin\mvn.cmd" set "MVN_CMD=C:\maven\apache-maven-3.9.9\bin\mvn.cmd"
if not defined MVN_CMD if exist "%USERPROFILE%\maven\apache-maven-3.9.9\bin\mvn.cmd" set "MVN_CMD=%USERPROFILE%\maven\apache-maven-3.9.9\bin\mvn.cmd"
if not defined MVN_CMD if exist "%USERPROFILE%\tools\apache-maven-3.9.9\bin\mvn.cmd" set "MVN_CMD=%USERPROFILE%\tools\apache-maven-3.9.9\bin\mvn.cmd"

if not defined MVN_CMD (
  for /f "delims=" %%M in ('where mvn 2^>nul') do (
    set "MVN_CMD=%%M"
    goto :mvnReady
  )
)
:mvnReady
if not defined MVN_CMD (
  echo [error] Maven not found.
  echo Run install.cmd from the repo root first - it can download Maven automatically.
  goto :fail
)

echo [ok] Java found
echo [ok] Maven: !MVN_CMD!

REM --- Warn if install was not run ---
if not exist "target\classes\META-INF\resources\index.html" (
  echo [warn] Backend not built yet. Run install.cmd from the repo root first.
  echo       Continuing - Maven will download dependencies on first run...
  echo.
)

REM --- Port 8080: warn only (do not block start; Quarkus reports a clear error if busy) ---
netstat -ano 2>nul | findstr /R /C:":8080 .*LISTENING" >nul 2>&1
if not errorlevel 1 (
  echo [warn] Something appears to be listening on port 8080.
  echo       If startup fails, stop the other process or close the other Quarkus window.
  echo       Tip: netstat -ano ^| findstr :8080
  echo.
)

echo Starting Quarkus...  (open http://localhost:8080 when ready)
echo Press Ctrl+C or type q then Enter to stop.
echo.
call "!MVN_CMD!" quarkus:dev -Ddebug=false
set "EXIT_CODE=!errorlevel!"
echo.
if !EXIT_CODE! neq 0 (
  echo [error] Quarkus exited with code !EXIT_CODE!.
  goto :fail
)
echo Quarkus stopped normally.
if /i "%~1"=="_KEEPOPEN" (
  echo Press any key to close this window...
  pause >nul
)
exit /b 0

:fail
echo.
echo Startup failed. After fixing the issue above:
echo   1. Run ..\install.cmd from the repo root if deps are missing
echo   2. Run this script again
echo.
if /i "%~1"=="_KEEPOPEN" (
  echo Press any key to close this window...
  pause >nul
)
exit /b 1
