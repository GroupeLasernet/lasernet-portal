@echo off
REM Relfar V4 dashboard launcher (TCP protocol, not RS485)
REM
REM HOW TO USE:
REM   1. Connect this PC to the controller's WiFi network:
REM        SSID:     RDWelder
REM        Password: 12345678
REM   2. Double-click this file.
REM   3. Open http://localhost:5000 in your browser.
REM
REM The controller will be at 192.168.1.5 and this PC should get 192.168.1.2
REM or similar on that network. The dashboard binds to 192.168.1.2 by default.
REM
REM If the PC ends up with a different IP on the RDWelder AP, override with:
REM   set RELFAR_BIND=192.168.1.X
REM before launching.

cd /d "%~dp0"
echo ===========================================================
echo   Relfar V4 / RDCleanV4-DWPro - Live Dashboard
echo ===========================================================
echo.
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found. Install from https://python.org
    pause
    exit /b 1
)
echo Installing/updating dependencies...
python -m pip install --quiet flask flask-cors
echo.
if "%RELFAR_HOST%"=="" set RELFAR_HOST=192.168.1.5
if "%RELFAR_BIND%"=="" set RELFAR_BIND=192.168.1.2
echo Controller: %RELFAR_HOST%
echo Bind IP:    %RELFAR_BIND%
echo.
echo Starting dashboard at http://localhost:5000
echo Press Ctrl+C to stop.
echo.
python relfar_server.py
pause
