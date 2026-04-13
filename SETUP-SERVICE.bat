@echo off
:: SETUP-SERVICE.bat
:: Registers the kiosk server as a Windows Task Scheduler task that starts
:: at system boot — survives reboots and power cuts without requiring login.
::
:: Run this once as Administrator. After that, node server.js always runs
:: in the background regardless of who is (or isn't) logged in.
::
:: The task is named "WorldMapKioskServer".
:: To remove it:  schtasks /delete /tn WorldMapKioskServer /f

cd /d "%~dp0"

echo.
echo === World Map Kiosk -- Server Auto-Start Setup ===
echo.

:: Must be Administrator
net session >nul 2>&1
if errorlevel 1 (
    echo ERROR: This script must be run as Administrator.
    echo Right-click SETUP-SERVICE.bat and choose "Run as administrator".
    echo.
    pause
    exit /b 1
)

:: Strip trailing backslash (PowerShell path quoting)
set "WM_INSTALL_DIR=%~dp0"
if "%WM_INSTALL_DIR:~-1%"=="\" set "WM_INSTALL_DIR=%WM_INSTALL_DIR:~0,-1%"

echo Install directory: %WM_INSTALL_DIR%
echo.
echo Registering scheduled task "WorldMapKioskServer"...

:: Pass dir via env var to avoid quoting nightmares with spaces in the path.
:: The task runs server-restart-loop.bat as SYSTEM at every system boot.
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$d = $env:WM_INSTALL_DIR;" ^
    "$bat = $d + '\server-restart-loop.bat';" ^
    "$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument ('/c \"\"' + $bat + '\"\"') -WorkingDirectory $d;" ^
    "$trigger = New-ScheduledTaskTrigger -AtStartup;" ^
    "$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable $true;" ^
    "$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest;" ^
    "Register-ScheduledTask -TaskName 'WorldMapKioskServer' -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null;" ^
    "Write-Host 'Task registered OK.'"

if errorlevel 1 (
    echo.
    echo ERROR: Failed to register the scheduled task.
    echo Make sure you are running as Administrator and try again.
    pause
    exit /b 1
)

echo.
echo Starting server now (no reboot needed)...
schtasks /run /tn "WorldMapKioskServer" >nul 2>&1
timeout /t 3 /nobreak >nul

:: Quick health check
curl -s -f -m 5 http://127.0.0.1:3030/api/health >nul 2>&1
if not errorlevel 1 (
    echo Server is up and responding on port 3030.
) else (
    echo Server started -- may still be initialising. Check server.log if needed.
)

echo.
echo === Setup complete ===
echo.
echo  WorldMapKioskServer will now:
echo    - Start automatically at every system boot (no login required)
echo    - Restart itself if node.exe crashes
echo    - Restart after auto-updates (exit code 100)
echo.
echo  Also run SETUP-AUTOSTART.bat to configure the browser
echo  to open automatically when a user logs in.
echo.
pause
