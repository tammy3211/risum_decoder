@echo off
REM Navigate to the directory where this script is located
cd /d "%~dp0"

echo Starting RisuAI Module Decoder server...
echo.
echo This window must remain open for the decoder to work.
echo Close this window to stop the server.
echo.

REM Start the Python HTTP server in a new command prompt window
REM /k keeps the new window open after the command finishes
start "RisuAI Decoder Server" cmd /k python -m http.server 8000

REM Give the server a moment to start (optional, but good practice)
timeout /t 2 >nul

REM Open the decoder page in the default web browser
start "" "http://localhost:8000/decoder/?v=2"

echo Decoder page opened in your browser.
echo.
