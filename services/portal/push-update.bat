@echo off
echo ============================================
echo   LaserNet Portal - Push Update to Vercel
echo ============================================
echo.

cd /d "%~dp0"

echo Step 1: Removing git lock file...
if exist ".git\index.lock" (
    del /f ".git\index.lock"
    echo    Lock file removed.
) else (
    echo    No lock file found.
)

echo.
echo Step 2: Staging all changes...
git add -A
echo    Files staged.

echo.
echo Step 3: Committing...
git commit -m "Switch QuickBooks token storage from in-memory to encrypted cookies"
echo    Committed.

echo.
echo Step 4: Pushing to GitHub (this triggers Vercel redeployment)...
git push origin main

echo.
echo ============================================
echo   Done! Vercel will redeploy in 1-2 minutes.
echo   Then go to your portal and click Connect.
echo ============================================
echo.
pause
