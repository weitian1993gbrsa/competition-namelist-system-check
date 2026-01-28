@echo off
set "SOURCE=%~dp0"
:: Remove trailing backslash
if "%SOURCE:~-1%"=="\" set "SOURCE=%SOURCE:~0,-1%"

set "DEST=C:\Users\nagas\Documents\GitHub\competition-namelist-system-check"

echo.
echo ========================================================
echo   PREPARING CLEAN GITHUB COPY
echo ========================================================
echo   Source: %SOURCE%
echo   Target: %DEST%
echo.

echo.
echo   [CLEANUP] Ensuring target folder exists...
if not exist "%DEST%" mkdir "%DEST%"

echo   [CLEANUP] Removing large folders from target (if present)...
:: We explicitly remove these because Robocopy /XD ignores them in destination too (won't purge)
if exist "%DEST%\node_modules" rmdir /s /q "%DEST%\node_modules"
if exist "%DEST%\dist" rmdir /s /q "%DEST%\dist"
if exist "%DEST%\dist_electron" rmdir /s /q "%DEST%\dist_electron"
if exist "%DEST%\dist-electron" rmdir /s /q "%DEST%\dist-electron"
if exist "%DEST%\release" rmdir /s /q "%DEST%\release"
if exist "%DEST%\.gemini" rmdir /s /q "%DEST%\.gemini"
timeout /t 1 /nobreak >nul

:: Robocopy (Since folder is empty, /MIR acts like /E)
robocopy "%SOURCE%" "%DEST%" /E ^
    /XD "node_modules" ".git" ".gemini" "dist" "dist_electron" "dist-electron" "dist_electron_beta" ".vscode" ".idea" "coverage" "release" "brain" ^
    /XF "*.log" "*.tmp" "backup.zip" "*.zip"

if %ERRORLEVEL% GTR 7 (
    echo.
    echo   [ERROR] Copy encountered errors.
    pause
    exit /b
)

echo.
echo ========================================================
echo   [SUCCESS] DONE!
echo   Your clean code is ready at:
echo   %DEST%
echo ========================================================
pause
