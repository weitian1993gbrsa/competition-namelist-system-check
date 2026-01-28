@echo off
setlocal enabledelayedexpansion

:: Set source directory to the script's location
set "SOURCE_DIR=%~dp0"
cd /d "%SOURCE_DIR%"

:: Create backups directory if it doesn't exist
if not exist "backups" (
    mkdir "backups"
)

:: Get current date and time for folder name (YYYY-MM-DD_HH-MM-SS format)
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set datetime=%%I
set "TIMESTAMP=%datetime:~0,4%-%datetime:~4,2%-%datetime:~6,2%_%datetime:~8,2%-%datetime:~10,2%-%datetime:~12,2%"

set "BACKUP_DIR=backups\namelist system_%TIMESTAMP%"
mkdir "%BACKUP_DIR%"

echo Backing up to %BACKUP_DIR%...

:: Copy specific files and folders
echo Copying Configuration Files...
copy "package.json" "%BACKUP_DIR%\" >nul
copy "package-lock.json" "%BACKUP_DIR%\" >nul
copy "vite.config.ts" "%BACKUP_DIR%\" >nul
copy "tsconfig*.json" "%BACKUP_DIR%\" >nul
copy "tailwind.config.js" "%BACKUP_DIR%\" >nul
copy "postcss.config.js" "%BACKUP_DIR%\" >nul
copy "index.html" "%BACKUP_DIR%\" >nul
copy "env.d.ts" "%BACKUP_DIR%\" >nul
copy "README.md" "%BACKUP_DIR%\" >nul
copy ".gitignore" "%BACKUP_DIR%\" >nul

:: Copy Scripts
echo Copying Scripts...
copy "start_app.bat" "%BACKUP_DIR%\" >nul
copy "backup.bat" "%BACKUP_DIR%\" >nul

:: Copy Directories
echo Copying Source Code...
xcopy "src" "%BACKUP_DIR%\src" /E /I /Y >nul
if exist "public" (
    echo Copying Public Assets...
    xcopy "public" "%BACKUP_DIR%\public" /E /I /Y >nul
)

echo.
echo Backup completed successfully at %BACKUP_DIR%
echo.
pause
