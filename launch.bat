@echo off
REM PIXEL CITY Game Launcher - Windows
REM Created for easy distribution of the GTA-style 3D game

ECHO.
ECHO ====================================================
ECHO           PIXEL CITY - Game Server Launcher
ECHO ====================================================
ECHO.
ECHO Starting PIXEL CITY game server...
ECHO.
ECHO SERVER WILL BE AVAILABLE AT:
ECHO   http://localhost:8123/
ECHO.
ECHO Instructions:
ECHO   1. Wait for server to start (you see server messages)
ECHO   2. Open your browser
ECHO   3. Go to: http://localhost:8123/
ECHO   4. Game loads automatically!
ECHO.
ECHO Press Ctrl+C to stop the server
ECHO.

REM Change to the directory where this script is located
cd /d "%~dp0"

REM Start Python HTTP server on port 8123
python -m http.server 8123

ECHO.
ECHO ====================================================
ECHO           Server stopped. Goodbye!
ECHO ====================================================
ECHO.

pause