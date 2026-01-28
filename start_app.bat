@echo off
cd /d "%~dp0"
echo Starting Namelist Manager...
echo Please ensure you have run 'npm install' at least once (which I did for you!).
echo.
echo Opening Browser...
start http://localhost:5173
echo Starting Server...
npm run dev
pause
