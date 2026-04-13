@echo off
:: SETUP-AUTOSTART.bat
:: Adds a login shortcut so the browser kiosk opens automatically when
:: a user logs in. This complements SETUP-SERVICE.bat (which keeps the
:: server running at the system level regardless of login).
::
:: Recommended setup order:
::   1. Run SETUP-SERVICE.bat as Administrator  (server runs at boot)
::   2. Run SETUP-AUTOSTART.bat                 (browser opens on login)
cd /d "%~dp0"

:: Get the Windows Startup folder path
for /f "tokens=*" %%i in ('powershell -Command "[Environment]::GetFolderPath(\"Startup\")"') do set STARTUP=%%i

:: Create a shortcut to "Start Prayer Table.vbs" in the Startup folder
:: Using wscript.exe as target so the VBS runs silently (no cmd window)
powershell -Command "$ws = New-Object -ComObject WScript.Shell; $vbs = '%~dp0Start Prayer Table.vbs'; $lnk = '%STARTUP%\Prayer Table.lnk'; $sc = $ws.CreateShortcut($lnk); $sc.TargetPath = $vbs; $sc.WorkingDirectory = '%~dp0'; $sc.Description = 'Global Prayer Table Kiosk'; $sc.Save()"

echo.
echo Browser auto-start configured. Prayer Table will launch on next login.
echo Shortcut created at: %STARTUP%\Prayer Table.lnk
echo.
echo NOTE: Also run SETUP-SERVICE.bat as Administrator to ensure the server
echo starts at system boot (even before login / after a power cut).
echo.
pause
