@echo off
echo ============================================
echo   Prisma - Push Update to GitHub / Vercel
echo ============================================
echo.

cd /d "%~dp0"

echo Step 1: Removing git lock file if stuck...
if exist ".git\index.lock" (
    del /f ".git\index.lock"
    echo    Lock file removed.
) else (
    echo    No lock file found.
)

echo.
set /p MSG="Commit message (or press Enter for default): "
if "%MSG%"=="" set MSG=Update Prisma platform

echo.
echo Step 2: Staging all changes...
git add -A
echo    Files staged.

echo.
echo Step 3: Committing...
git commit -m "%MSG%"
if errorlevel 1 (
    echo    Nothing to commit or commit failed.
    pause
    exit /b 1
)
echo    Committed.

echo.
echo Step 4: Pushing to GitHub...
git push origin main
if errorlevel 1 (
    echo    Push failed! Check your connection or credentials.
    pause
    exit /b 1
)

echo.
echo ============================================
echo   Done! Vercel will redeploy the portal
echo   in 1-2 minutes.
echo ============================================
echo.
pause
