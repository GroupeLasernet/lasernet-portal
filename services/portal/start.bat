@echo off
echo ========================================
echo   LaserNet Portal - Starting...
echo   Port: 3000
echo ========================================
cd /d "%~dp0"
call npm install 2>nul
call npx prisma generate
call npx prisma db push
npm run dev
