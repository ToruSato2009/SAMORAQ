@echo off
setlocal
title SAMORAQ V2
cd /d "%~dp0"

where py >nul 2>nul
if not errorlevel 1 (
    echo Starting SAMORAQ V2 at http://127.0.0.1:8000
    echo Keep this window open while using SAMORAQ.
    start "SAMORAQ local server" /b py -3 -m http.server 8000 --bind 127.0.0.1
    timeout /t 2 /nobreak >nul
    start "" "http://127.0.0.1:8000/index.html"
    echo Press Ctrl+C in the server window to stop it.
    pause
    exit /b
)

where python >nul 2>nul
if not errorlevel 1 (
    echo Starting SAMORAQ V2 at http://127.0.0.1:8000
    start "SAMORAQ local server" /b python -m http.server 8000 --bind 127.0.0.1
    timeout /t 2 /nobreak >nul
    start "" "http://127.0.0.1:8000/index.html"
    echo Press Ctrl+C in the server window to stop it.
    pause
    exit /b
)

echo Python was not found. Opening the local landing page directly instead.
start "" "%~dp0index.html"
echo If browser storage behaves inconsistently, install Python 3 and run this file again.
pause
