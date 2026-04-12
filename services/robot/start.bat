@echo off
echo ========================================
echo   Elfin Cobot Service - Starting...
echo   Port: 8080
echo ========================================
cd /d "%~dp0"
pip install -r requirements.txt 2>nul
python run.py
