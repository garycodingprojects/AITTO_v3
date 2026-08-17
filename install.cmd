@echo off
REM One-time project install for AITTO (Windows).
REM Double-click this file, or run from the repo root: .\install.cmd
REM
REM What this does:
REM   1) Checks Java / Maven / Node (installs missing ones when possible)
REM   2) Installs chat-agent npm packages + creates chat-agent\.env
REM   3) Builds the timetable backend (downloads Maven dependencies)

setlocal EnableDelayedExpansion
cd /d "%~dp0"

REM Keep the window open when double-clicked so errors stay visible.
if /i not "%~1"=="_KEEPOPEN" (
  echo.%CMDCMDLINE% | find /I "/c" >nul
  if not errorlevel 1 (
    cmd /k "%~f0" _KEEPOPEN
    exit /b %ERRORLEVEL%
  )
)

echo.
echo ============================================================
echo   AITTO install - one-time setup
echo ============================================================
echo   Folder: %CD%
echo.
echo   This may take several minutes the first time.
echo   Leave this window open until you see "Install complete".
echo ============================================================
echo.

set "MVN_CMD="
set "NEED_PATH_REFRESH=0"

echo [1/4] Checking tools - Java, Maven, Node.js ...
call :ensureJava
if errorlevel 1 goto :fail
call :resolveMaven
if errorlevel 1 goto :fail
call :ensureNode
if errorlevel 1 goto :fail

if "!NEED_PATH_REFRESH!"=="1" call :refreshPath

where java >nul 2>&1
if errorlevel 1 (
  echo [error] Java still not on PATH after install.
  echo Close this window, open a NEW terminal, then run install.cmd again.
  goto :fail
)
where node >nul 2>&1
if errorlevel 1 (
  echo [error] Node still not on PATH after install.
  echo Close this window, open a NEW terminal, then run install.cmd again.
  goto :fail
)
if not defined MVN_CMD (
  call :resolveMaven
  if errorlevel 1 goto :fail
)

echo.
echo [ok] Tools ready
java -version 2>&1 | findstr /i "version"
echo       Maven: !MVN_CMD!
for /f "tokens=*" %%V in ('node -v 2^>nul') do echo       Node:  %%V
echo.

echo [2/4] Installing Timetable Agent packages - chat-agent ...
pushd "%~dp0chat-agent"
REM --no-fund/--no-audit keeps the log clean for first-time users.
call npm.cmd install --no-fund --no-audit
set "NPM_EXIT=!ERRORLEVEL!"
popd
if not "!NPM_EXIT!"=="0" (
  echo [error] chat-agent npm install failed - exit code !NPM_EXIT!
  echo Tip: use npm.cmd, not npm, if PowerShell blocks scripts.
  goto :fail
)

if not exist "%~dp0chat-agent\.env" (
  echo [info] Creating empty chat-agent\.env
  type nul > "%~dp0chat-agent\.env"
)
echo [ok] chat-agent ready
echo.

echo [3/4] Building timetable backend - Maven package ...
echo       First run downloads dependencies; this can take a while.
echo.
cd /d "%~dp0school-timetabling"
call "!MVN_CMD!" -B -DskipTests package
set "MVN_EXIT=!ERRORLEVEL!"
echo.
if not "!MVN_EXIT!"=="0" (
  echo [error] Maven build failed - exit code !MVN_EXIT!
  echo Scroll up for the Maven error, then fix and re-run install.cmd.
  echo Manual retry:
  echo   cd school-timetabling
  echo   mvn -B -DskipTests package
  goto :fail
)
if not exist "target\quarkus-artifact.properties" if not exist "target\classes" (
  echo [error] Maven finished but build output is missing under target\
  goto :fail
)
echo [ok] Backend build ready
echo.

echo [4/4] Checking install ...
cd /d "%~dp0"
call "%~dp0verify-install.cmd" _FROM_INSTALL
set "VERIFY_EXIT=!ERRORLEVEL!"
if not "!VERIFY_EXIT!"=="0" (
  echo [warn] Automatic verify reported a problem. Run verify-install.cmd yourself.
)

echo.
echo ============================================================
echo   Install complete
echo ============================================================
echo.
echo   Start the app - open TWO windows and leave both running:
echo.
echo     1. Double-click  start-backend.cmd
echo     2. Double-click  start-agent.cmd
echo     3. Browser:      http://localhost:8080
echo.
echo   Optional check anytime:  verify-install.cmd
echo.
echo   AI Scheduler works without an LLM.
echo   Timetable Agent needs an OpenAI-compatible model in the UI.
echo ============================================================
echo.
if /i "%~1"=="_KEEPOPEN" (
  echo Press any key to close this window...
  pause >nul
)
exit /b 0

:fail
echo.
echo ============================================================
echo   Install FAILED
echo ============================================================
echo   Fix the error above, then run install.cmd again.
echo   Details: README.md  -  Quick start / System Requirements
echo ============================================================
echo.
if /i "%~1"=="_KEEPOPEN" (
  echo Press any key to close this window...
  pause >nul
)
exit /b 1

:refreshPath
echo [info] Refreshing PATH for this window...
set "PATH=%SystemRoot%\system32;%SystemRoot%;%SystemRoot%\System32\Wbem;%SystemRoot%\System32\WindowsPowerShell\v1.0\"
for /f "tokens=2*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "PATH=!PATH!;%%B"
for /f "tokens=2*" %%A in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "PATH=!PATH!;%%B"
if exist "C:\maven\apache-maven-3.9.9\bin" set "PATH=!PATH!;C:\maven\apache-maven-3.9.9\bin"
if exist "%USERPROFILE%\maven\apache-maven-3.9.9\bin" set "PATH=!PATH!;%USERPROFILE%\maven\apache-maven-3.9.9\bin"
if exist "%USERPROFILE%\tools\apache-maven-3.9.9\bin" set "PATH=!PATH!;%USERPROFILE%\tools\apache-maven-3.9.9\bin"
exit /b 0

:ensureJava
where java >nul 2>&1
if not errorlevel 1 exit /b 0

echo [info] Java not found. Installing Microsoft OpenJDK 21 via winget...
where winget >nul 2>&1
if errorlevel 1 (
  echo [error] winget not found. Install Java JDK 17+ manually, then re-run.
  echo   https://learn.microsoft.com/en-us/java/openjdk/download
  exit /b 1
)
winget install Microsoft.OpenJDK.21 --accept-package-agreements --accept-source-agreements
if errorlevel 1 (
  echo [error] winget failed to install Java.
  exit /b 1
)
set "NEED_PATH_REFRESH=1"
call :refreshPath
where java >nul 2>&1
if errorlevel 1 (
  echo [error] Java installed but not on PATH yet. Close this window, open a NEW terminal, run install.cmd again.
  exit /b 1
)
echo [ok] Java installed
exit /b 0

:ensureNode
where node >nul 2>&1
if not errorlevel 1 exit /b 0

echo [info] Node.js not found. Installing Node.js LTS via winget...
where winget >nul 2>&1
if errorlevel 1 (
  echo [error] winget not found. Install Node.js 20+ from https://nodejs.org/ then re-run.
  exit /b 1
)
winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
if errorlevel 1 (
  echo [error] winget failed to install Node.js.
  exit /b 1
)
set "NEED_PATH_REFRESH=1"
call :refreshPath
where node >nul 2>&1
if errorlevel 1 (
  echo [error] Node installed but not on PATH yet. Close this window, open a NEW terminal, run install.cmd again.
  exit /b 1
)
echo [ok] Node.js installed
exit /b 0

:resolveMaven
REM Prefer full path so PATH refreshes cannot break later "call mvn".
set "MVN_CMD="
for /f "delims=" %%M in ('where mvn 2^>nul') do (
  set "MVN_CMD=%%M"
  goto :resolveMavenHaveCmd
)
if exist "C:\maven\apache-maven-3.9.9\bin\mvn.cmd" (
  set "MVN_CMD=C:\maven\apache-maven-3.9.9\bin\mvn.cmd"
  goto :resolveMavenHaveCmd
)
if exist "%USERPROFILE%\maven\apache-maven-3.9.9\bin\mvn.cmd" (
  set "MVN_CMD=%USERPROFILE%\maven\apache-maven-3.9.9\bin\mvn.cmd"
  goto :resolveMavenHaveCmd
)
if exist "%USERPROFILE%\tools\apache-maven-3.9.9\bin\mvn.cmd" (
  set "MVN_CMD=%USERPROFILE%\tools\apache-maven-3.9.9\bin\mvn.cmd"
  goto :resolveMavenHaveCmd
)

echo [info] Maven not found. Downloading Apache Maven 3.9.9 ...
set "MAVEN_HOME=%USERPROFILE%\maven\apache-maven-3.9.9"
set "MAVEN_ZIP=%TEMP%\apache-maven-3.9.9-bin.zip"
if not exist "%USERPROFILE%\maven" mkdir "%USERPROFILE%\maven" >nul 2>&1

curl.exe -L --fail --retry 3 -o "%MAVEN_ZIP%" "https://archive.apache.org/dist/maven/maven-3/3.9.9/binaries/apache-maven-3.9.9-bin.zip"
if errorlevel 1 (
  echo [error] Failed to download Maven. Check your network, then re-run.
  echo Manual steps are in README.md.
  exit /b 1
)

tar.exe -xf "%MAVEN_ZIP%" -C "%USERPROFILE%\maven"
if errorlevel 1 (
  echo [error] Failed to extract Maven zip.
  exit /b 1
)

if not exist "%MAVEN_HOME%\bin\mvn.cmd" (
  echo [error] mvn.cmd not found after extract: %MAVEN_HOME%\bin\mvn.cmd
  exit /b 1
)

set "USERPATH="
for /f "tokens=2*" %%A in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "USERPATH=%%B"
if defined USERPATH (
  echo.!USERPATH! | find /I "%MAVEN_HOME%\bin" >nul
  if errorlevel 1 setx PATH "!USERPATH!;%MAVEN_HOME%\bin" >nul
) else (
  setx PATH "%MAVEN_HOME%\bin" >nul
)
set "PATH=%PATH%;%MAVEN_HOME%\bin"
set "MVN_CMD=%MAVEN_HOME%\bin\mvn.cmd"
echo [ok] Maven installed to %MAVEN_HOME%
exit /b 0

:resolveMavenHaveCmd
echo [info] Using Maven: !MVN_CMD!
exit /b 0
