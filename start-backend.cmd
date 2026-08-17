@echo off
REM Start the timetable backend - Quarkus on http://localhost:8080
REM Double-click from the repo root, or run: .\start-backend.cmd
cd /d "%~dp0"
call "%~dp0school-timetabling\start-dev.cmd" %*
