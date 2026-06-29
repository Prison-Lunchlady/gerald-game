@echo off
title What Should Gerald Do? - Launcher
color 0B

echo.
echo  ================================================
echo   WHAT SHOULD GERALD DO?
echo   Setting up Gerald's pool...
echo  ================================================
echo.

:: Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo  ERROR: Node.js is not installed!
    echo.
    echo  To fix this:
    echo  1. Open your browser
    echo  2. Go to:  https://nodejs.org
    echo  3. Click the big green LTS button and install it
    echo  4. Come back and double-click PLAY_GERALD.bat again
    echo.
    echo  Full instructions are in the HOW_TO_PLAY folder.
    echo.
    pause
    exit
)

echo  Node.js found! Good to go.
echo.

:: Install packages if node_modules doesn't exist
if not exist "node_modules\" (
    echo  Installing game files for the first time...
    echo  This takes about a minute. Please wait...
    echo.
    call npm install
    echo.
    echo  Install complete!
    echo.
)

echo  Starting Gerald's game server...
echo.
echo  ================================================
echo   Opening your browser automatically...
echo   If it doesn't open, go to:
echo   http://localhost:5173
echo  ================================================
echo.

:: Open the browser automatically after 4 seconds
start "" cmd /c "timeout /t 4 >nul && start http://localhost:5173"

:: Start the game
call npm run dev

pause
