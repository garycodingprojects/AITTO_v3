@echo off
REM Install chat-agent npm packages without relying on npm.ps1.
cd /d "%~dp0"
call npm.cmd install --no-fund --no-audit
exit /b %ERRORLEVEL%
