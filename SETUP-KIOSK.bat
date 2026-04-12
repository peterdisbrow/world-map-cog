@echo off
:: ============================================================
:: SETUP-KIOSK.bat  —  Run once as Administrator
:: Hardens this Windows PC for unattended kiosk operation.
:: ============================================================
title Prayer Table Kiosk Setup

:: Require elevation
net session >nul 2>&1
if errorlevel 1 (
    echo.
    echo  ERROR: This script must be run as Administrator.
    echo  Right-click SETUP-KIOSK.bat and choose "Run as administrator".
    echo.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo   Prayer Table Kiosk Setup
echo ============================================================
echo.

:: ── 1. Nightly reboot scheduled task ─────────────────────────────────
echo [1/4] Creating "Prayer Table Nightly Reboot" scheduled task (3:00 AM daily)...
schtasks /delete /tn "Prayer Table Nightly Reboot" /f >nul 2>&1
schtasks /create ^
  /tn "Prayer Table Nightly Reboot" ^
  /tr "shutdown /r /f /t 0" ^
  /sc daily ^
  /st 03:00 ^
  /ru SYSTEM ^
  /rl highest ^
  /f
if errorlevel 1 (
    echo   WARNING: Could not create scheduled task.
) else (
    echo   OK — Nightly reboot scheduled for 3:00 AM.
)
echo.

:: ── 2. Power plan: never sleep, never turn off display ────────────────
echo [2/4] Setting power plan to "never sleep / never turn off display"...
REM Set scheme to High Performance
powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c >nul 2>&1
REM Standby (sleep) timeout — AC and DC: 0 = never
powercfg /change standby-timeout-ac 0
powercfg /change standby-timeout-dc 0
REM Hibernate timeout — AC and DC: 0 = never
powercfg /change hibernate-timeout-ac 0
powercfg /change hibernate-timeout-dc 0
REM Monitor (display) timeout — AC and DC: 0 = never
powercfg /change monitor-timeout-ac 0
powercfg /change monitor-timeout-dc 0
REM Disable hibernate completely
powercfg /hibernate off
echo   OK — Display and sleep timeouts set to Never.
echo.

:: ── 3. Disable Windows Update auto-restart ───────────────────────────
echo [3/4] Disabling Windows Update auto-restart and pausing updates...

REM Active hours spanning all day (0–23) prevents WU from rebooting
reg add "HKLM\SOFTWARE\Microsoft\WindowsUpdate\UX\Settings" /v ActiveHoursStart /t REG_DWORD /d 0 /f >nul
reg add "HKLM\SOFTWARE\Microsoft\WindowsUpdate\UX\Settings" /v ActiveHoursEnd   /t REG_DWORD /d 23 /f >nul

REM Pause WU updates for 35 days (hides the "resume" button in Settings)
reg add "HKLM\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate" /v SetDisableUPauseUXAccess /t REG_DWORD /d 1 /f >nul

REM Stop and permanently disable the Windows Update service
sc stop wuauserv >nul 2>&1
sc config wuauserv start=disabled >nul
echo   OK — Windows Update service disabled; active-hours set to 0–23; updates paused 35 days.
echo.

:: ── 4. Auto-hide taskbar ─────────────────────────────────────────────
echo [4/4] Auto-hiding the taskbar...
REM StuckRects3 binary — byte 8 (0-indexed) controls auto-hide.
REM Value 03 = auto-hide enabled.  This is the standard Win10/11 DWORD at offset 8.
REM We use PowerShell to flip just that byte cleanly.
powershell -NoProfile -Command ^
  "$p = 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StuckRects3'; " ^
  "if (Test-Path $p) { " ^
    "$v = (Get-ItemProperty $p).Settings; " ^
    "$v[8] = 3; " ^
    "Set-ItemProperty $p -Name Settings -Value $v; " ^
    "Write-Host '  OK -- Taskbar set to auto-hide. Restart Explorer to apply.' " ^
  "} else { " ^
    "Write-Host '  SKIP -- StuckRects3 key not found (normal on fresh accounts).' " ^
  "}"

REM Restart Explorer so the setting takes effect immediately
taskkill /f /im explorer.exe >nul 2>&1
start explorer.exe
echo.

:: ── Done ─────────────────────────────────────────────────────────────
echo ============================================================
echo   Setup complete!  Summary:
echo.
echo   [1] Nightly reboot at 3:00 AM ............. SCHEDULED TASK
echo   [2] Never sleep / never turn off display .. POWER PLAN
echo   [3] Windows Update disabled ............... SERVICE + POLICY
echo   [4] Taskbar auto-hidden ................... REGISTRY
echo.
echo   Reboot the PC now to apply all settings cleanly.
echo ============================================================
echo.
pause
