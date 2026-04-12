@echo off
cd /d "%~dp0"

:: Get the Windows Startup folder path
for /f "tokens=*" %%i in ('powershell -Command "[Environment]::GetFolderPath(\"Startup\")"') do set STARTUP=%%i

:: Create a shortcut to "Start Prayer Table.vbs" in the Startup folder
:: Using wscript.exe as target so the VBS runs silently (no cmd window)
powershell -Command "$ws = New-Object -ComObject WScript.Shell; $vbs = '%~dp0Start Prayer Table.vbs'; $lnk = '%STARTUP%\Prayer Table.lnk'; $sc = $ws.CreateShortcut($lnk); $sc.TargetPath = $vbs; $sc.WorkingDirectory = '%~dp0'; $sc.Description = 'Global Prayer Table Kiosk'; $sc.Save()"

echo.
echo Auto-start configured. Prayer Table will launch on next login.
echo Shortcut created at: %STARTUP%\Prayer Table.lnk
echo.
pause
