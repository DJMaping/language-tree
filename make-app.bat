@echo off
rem Creates the pinnable "Andah Language Tree" desktop/Start Menu shortcut.
rem Double-click once, then right-click the new shortcut -> Pin to taskbar.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-shortcut.ps1"
pause
