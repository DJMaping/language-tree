@echo off
rem Launches the Andah Language Tree as its own app window.
rem The server runs invisibly and exits by itself when the window is closed.
cd /d "%~dp0"
wscript.exe "scripts\hidden-launch.vbs"
