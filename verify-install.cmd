@echo off
REM Verify AITTO tools + project install (Windows).
REM Double-click, or run: .\verify-install.cmd
REM Called from install.cmd with arg _FROM_INSTALL - no pause, no re-launch.

setlocal EnableDelayedExpansion
cd /d "%~dp0"

if /i "%~1"=="_FROM_INSTALL" goto :main

if /i not "%~1"=="_KEEPOPEN" (
  echo.%CMDCMDLINE% | find /I "/c" >nul
  if not errorlevel 1 (
    cmd /k "%~f0" _KEEPOPEN
    exit /b %ERRORLEVEL%
  )
)

:main
set "FAILED=0"

echo.
echo === AITTO verify-install ===
echo Repo: %CD%
echo.

echo --- Tools ---
where java >nul 2>&1
if errorlevel 1 (
  echo [FAIL] java not found
  set "FAILED=1"
) else (
  echo [OK] java
  java -version 2>&1 | findstr /i "version"
)

set "MVN_OK=0"
where mvn >nul 2>&1
if not errorlevel 1 (
  echo [OK] mvn on PATH
  mvn -version 2>&1 | findstr /i "Apache Maven"
  set "MVN_OK=1"
)
if "!MVN_OK!"=="0" if exist "C:\maven\apache-maven-3.9.9\bin\mvn.cmd" (
  echo [OK] mvn at C:\maven\apache-maven-3.9.9
  call "C:\maven\apache-maven-3.9.9\bin\mvn.cmd" -version 2>&1 | findstr /i "Apache Maven"
  set "MVN_OK=1"
)
if "!MVN_OK!"=="0" if exist "%USERPROFILE%\maven\apache-maven-3.9.9\bin\mvn.cmd" (
  echo [OK] mvn at %USERPROFILE%\maven\apache-maven-3.9.9
  call "%USERPROFILE%\maven\apache-maven-3.9.9\bin\mvn.cmd" -version 2>&1 | findstr /i "Apache Maven"
  set "MVN_OK=1"
)
if "!MVN_OK!"=="0" if exist "%USERPROFILE%\tools\apache-maven-3.9.9\bin\mvn.cmd" (
  echo [OK] mvn at %USERPROFILE%\tools\apache-maven-3.9.9
  call "%USERPROFILE%\tools\apache-maven-3.9.9\bin\mvn.cmd" -version 2>&1 | findstr /i "Apache Maven"
  set "MVN_OK=1"
)
if "!MVN_OK!"=="0" (
  echo [FAIL] Maven not found
  set "FAILED=1"
)

where node >nul 2>&1
if errorlevel 1 (
  echo [FAIL] node not found
  set "FAILED=1"
) else (
  echo [OK] node
  node -v
)

echo.
echo --- Project files ---
if exist "%~dp0chat-agent\node_modules" (
  echo [OK] chat-agent\node_modules
) else (
  echo [FAIL] chat-agent\node_modules missing - run install.cmd
  set "FAILED=1"
)

if exist "%~dp0chat-agent\.env" (
  echo [OK] chat-agent\.env
) else (
  echo [FAIL] chat-agent\.env missing - run install.cmd
  set "FAILED=1"
)

REM Avoid parentheses in echo text inside IF blocks - ")" ends the IF early.
if exist "%~dp0school-timetabling\target\quarkus-artifact.properties" (
  echo [OK] school-timetabling Maven build - target ready
) else if exist "%~dp0school-timetabling\target\classes" (
  echo [OK] school-timetabling target\classes ready
) else (
  echo [FAIL] school-timetabling build missing - run install.cmd
  set "FAILED=1"
)

echo.
if "!FAILED!"=="0" (
  echo === VERIFY PASSED ===
  if /i not "%~1"=="_FROM_INSTALL" (
    echo Next: double-click start-backend.cmd and start-agent.cmd
    echo Then open http://localhost:8080
  )
) else (
  echo === VERIFY FAILED ===
  echo Run install.cmd from this folder, then verify-install.cmd again.
)
echo.

if /i "%~1"=="_FROM_INSTALL" exit /b !FAILED!
if /i "%~1"=="_KEEPOPEN" (
  echo Press any key to close this window...
  pause >nul
)
exit /b !FAILED!
