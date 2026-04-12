@echo off
echo ========================================
echo   Relfar Laser Controller - Starting...
echo   Port: 5000
echo ========================================
cd /d "%~dp0"
pip install -r requirements.txt 2>nul
python server.py
