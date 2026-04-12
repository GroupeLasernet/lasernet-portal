@echo off
echo ========================================
echo   Atelier DSM - Starting All Services
echo ========================================
echo.
echo Starting Robot service (port 8080)...
start "Robot Service" cmd /c "cd /d "%~dp0services\robot" && start.bat"
echo Starting Relfar service (port 5000)...
start "Relfar Service" cmd /c "cd /d "%~dp0services\relfar" && start.bat"
echo Starting Portal (port 3000)...
start "Portal" cmd /c "cd /d "%~dp0services\portal" && start.bat"
echo.
echo All services starting. Portal at http://localhost:3000
pause
