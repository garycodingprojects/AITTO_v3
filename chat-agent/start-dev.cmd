@echo off
REM Start the chat agent without relying on npm.ps1 (works when PowerShell script execution is disabled).
cd /d "%~dp0"
node --env-file=.env ./node_modules/tsx/dist/cli.mjs watch src/server.ts
