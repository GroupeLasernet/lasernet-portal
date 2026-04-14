@echo off
REM deploy-robot.bat - push to GitHub + pull + restart services on robot PC.
REM Run this from the Prisma repo root on your DEV PC after committing changes.
REM Prereqs:
REM   - You have ssh key auth to robot PC as "robotpc" (see ~/.ssh/config)
REM   - Robot PC has ElfinRobot + RelfarBridge services registered (via bootstrap-station.ps1)

setlocal
set REMOTE=robotpc
set REMOTE_REPO=C:\Prisma

echo.
echo === 1/3  Pushing to GitHub ===
git push origin main
if errorlevel 1 (
    echo Push failed. Aborting.
    exit /b 1
)

echo.
echo === 2/3  Pulling on robot PC ===
ssh %REMOTE% "cd /d %REMOTE_REPO% && git pull --ff-only"
if errorlevel 1 (
    echo Remote pull failed. Aborting.
    exit /b 1
)

echo.
echo === 3/3  Restarting services ===
ssh %REMOTE% "net stop ElfinRobot && net start ElfinRobot"
if errorlevel 1 (
    echo WARNING: Robot service restart failed. Check ElfinRobot service on robot PC.
)

ssh %REMOTE% "net stop RelfarBridge && net start RelfarBridge"
if errorlevel 1 (
    echo WARNING: Relfar service restart failed. Check RelfarBridge service on robot PC.
)

echo.
echo === Deploy complete ===
echo Robot UI should reflect changes within a few seconds.
endlocal
